#!/usr/bin/env python3
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"
IMAGES_DIR = ROOT_DIR / ".zzzimagenes"


def read_env_file(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        raise RuntimeError(f"Missing env file: {path}")

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def normalize_pb_url(raw_url: str) -> str:
    url = raw_url.strip().rstrip("/")
    if "host.docker.internal" in url:
        url = url.replace("host.docker.internal", "127.0.0.1")
    return url


def read_http_error(exc: HTTPError) -> str:
    try:
        payload = exc.read().decode("utf-8", errors="replace")
    except Exception:
        payload = ""
    return payload


class PocketBaseClient:
    def __init__(self, base_url: str, timeout_seconds: int = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.token: Optional[str] = None

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict] = None,
        content_type: Optional[str] = None,
        body: Optional[bytes] = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        headers = {
            "Accept": "application/json",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        req_body: Optional[bytes] = None
        if json_body is not None:
            req_body = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif body is not None:
            req_body = body
            if content_type:
                headers["Content-Type"] = content_type

        req = Request(url=url, data=req_body, method=method, headers=headers)
        try:
            with urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except HTTPError as exc:
            details = read_http_error(exc)
            raise RuntimeError(f"HTTP {exc.code} {method} {path} -> {details}") from exc
        except URLError as exc:
            raise RuntimeError(f"Connection error {method} {path}: {exc}") from exc

    def auth_superuser(self, identity: str, password: str) -> None:
        payload = self._request(
            "POST",
            "/api/collections/_superusers/auth-with-password",
            json_body={"identity": identity, "password": password},
        )
        token = payload.get("token")
        if not token:
            raise RuntimeError("Missing superuser token from PocketBase auth response")
        self.token = token

    def list_records(self, collection: str, *, filter_expr: Optional[str] = None, per_page: int = 200) -> List[dict]:
        query = {"perPage": str(per_page), "page": "1"}
        if filter_expr:
            query["filter"] = filter_expr
        path = f"/api/collections/{collection}/records?{urlencode(query)}"
        payload = self._request("GET", path)
        return payload.get("items", [])

    def get_by_filter(self, collection: str, filter_expr: str) -> Optional[dict]:
        items = self.list_records(collection, filter_expr=filter_expr, per_page=1)
        return items[0] if items else None

    def create_record(self, collection: str, data: dict) -> dict:
        return self._request("POST", f"/api/collections/{collection}/records", json_body=data)

    def update_record(self, collection: str, record_id: str, data: dict) -> dict:
        return self._request("PATCH", f"/api/collections/{collection}/records/{record_id}", json_body=data)

    def upload_files(self, collection: str, record_id: str, fields: Dict[str, Path]) -> dict:
        boundary = f"----pbseed-{uuid.uuid4().hex}"
        body = build_multipart_body(fields, boundary)
        return self._request(
            "PATCH",
            f"/api/collections/{collection}/records/{record_id}",
            body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )


def build_multipart_body(file_fields: Dict[str, Path], boundary: str) -> bytes:
    chunks: List[bytes] = []
    for field_name, file_path in file_fields.items():
        if not file_path.exists():
            continue
        mime, _ = mimetypes.guess_type(str(file_path))
        mime = mime or "application/octet-stream"
        filename = file_path.name
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            (
                f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
                f"Content-Type: {mime}\r\n\r\n"
            ).encode("utf-8")
        )
        chunks.append(file_path.read_bytes())
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks)


def ensure_images_exist(required_files: List[str]) -> None:
    missing = [name for name in required_files if not (IMAGES_DIR / name).exists()]
    if missing:
        raise RuntimeError(f"Missing image files in {IMAGES_DIR}: {', '.join(missing)}")


def upsert_user(client: PocketBaseClient, email: str, password: str, name: str, role: str) -> str:
    existing = client.get_by_filter("users", f'email="{email}"')
    if existing:
        client.update_record(
            "users",
            existing["id"],
            {
                "name": name,
                "role": role,
                "emailVisibility": True,
                "verified": True,
            },
        )
        return existing["id"]

    created = client.create_record(
        "users",
        {
            "email": email,
            "password": password,
            "passwordConfirm": password,
            "name": name,
            "role": role,
            "emailVisibility": True,
            "verified": True,
        },
    )
    return created["id"]


def upsert_category(client: PocketBaseClient, name: str, slug: str, icon: str, order: int) -> str:
    existing = client.get_by_filter("categories", f'slug="{slug}"')
    payload = {
        "name": name,
        "slug": slug,
        "icon": icon,
        "order": order,
    }
    if existing:
        client.update_record("categories", existing["id"], payload)
        return existing["id"]

    created = client.create_record("categories", payload)
    return created["id"]


def upsert_store(
    client: PocketBaseClient,
    *,
    name: str,
    slug: str,
    owner_id: str,
    location: str,
    whatsapp: str,
    instagram: str,
    verified: bool,
    rating: float,
    reviews_count: int,
    payment_instructions: str,
    logo_file: str,
    banner_file: str,
) -> str:
    existing = client.get_by_filter("stores", f'slug="{slug}"')
    payload = {
        "name": name,
        "slug": slug,
        "description": f"{name} vende ropa y accesorios en Bolivia con entrega rapida y stock real.",
        "owner": [owner_id],
        "verified": verified,
        "status": "active",
        "rating": rating,
        "reviews_count": reviews_count,
        "rating_sum": round(rating * max(reviews_count, 1), 2),
        "location": location,
        "whatsapp": whatsapp,
        "instagram": instagram,
        "payment_instructions": payment_instructions,
    }

    if existing:
        record_id = existing["id"]
        client.update_record("stores", record_id, payload)
    else:
        created = client.create_record("stores", payload)
        record_id = created["id"]

    client.upload_files(
        "stores",
        record_id,
        {
            "logo": IMAGES_DIR / logo_file,
            "banner": IMAGES_DIR / banner_file,
        },
    )
    return record_id


def upsert_product(
    client: PocketBaseClient,
    *,
    name: str,
    slug: str,
    description: str,
    price_bs: float,
    stock: int,
    featured: bool,
    condition: str,
    store_id: str,
    category_id: str,
    image_file: str,
) -> str:
    existing = client.get_by_filter("products", f'slug="{slug}"')
    payload = {
        "name": name,
        "slug": slug,
        "description": description,
        "price": price_bs,
        "store": store_id,
        "category": category_id,
        "stock": stock,
        "status": "active",
        "featured": featured,
        "condition": condition,
    }

    if existing:
        record_id = existing["id"]
        client.update_record("products", record_id, payload)
    else:
        created = client.create_record("products", payload)
        record_id = created["id"]

    client.upload_files(
        "products",
        record_id,
        {
            "images": IMAGES_DIR / image_file,
        },
    )
    return record_id


def upsert_auction(
    client: PocketBaseClient,
    *,
    title: str,
    store_id: str,
    product_id: Optional[str],
    start_price: float,
    current_price: float,
    reserve_price: float,
    buy_now_price: float,
    start_date_iso: str,
    end_date_iso: str,
    status: str,
    image_file: str,
) -> str:
    existing = client.get_by_filter("auctions", f'title="{title}" && store="{store_id}"')
    payload = {
        "title": title,
        "description": "Subasta con stock validado y entrega en Bolivia.",
        "store": store_id,
        "product": product_id,
        "start_price": start_price,
        "current_price": current_price,
        "reserve_price": reserve_price,
        "buy_now_price": buy_now_price,
        "start_date": start_date_iso,
        "end_date": end_date_iso,
        "status": status,
    }

    if existing:
        record_id = existing["id"]
        client.update_record("auctions", record_id, payload)
    else:
        created = client.create_record("auctions", payload)
        record_id = created["id"]

    client.upload_files(
        "auctions",
        record_id,
        {
            "images": IMAGES_DIR / image_file,
        },
    )
    return record_id


def upsert_auction_bid(
    client: PocketBaseClient,
    *,
    auction_id: str,
    bidder_id: str,
    amount: float,
    is_auto_bid: bool,
    auto_bid_max: Optional[float],
) -> str:
    existing = client.get_by_filter("auction_bids", f'auction="{auction_id}" && bidder="{bidder_id}" && amount={amount}')
    payload = {
        "auction": auction_id,
        "bidder": bidder_id,
        "amount": amount,
        "is_auto_bid": is_auto_bid,
        "auto_bid_max": auto_bid_max,
    }
    if existing:
        client.update_record("auction_bids", existing["id"], payload)
        return existing["id"]

    created = client.create_record("auction_bids", payload)
    return created["id"]


def upsert_review(
    client: PocketBaseClient,
    *,
    reviewer_id: str,
    product_id: str,
    rating: float,
    title: str = "",
    comment: str = "",
    verified_purchase: bool = True,
) -> str:
    """Create or update a product review."""
    existing = client.get_by_filter(
        "reviews",
        f'reviewer="{reviewer_id}" && product="{product_id}"',
    )
    payload = {
        "reviewer": reviewer_id,
        "product": product_id,
        "rating": rating,
        "verified_purchase": verified_purchase,
    }
    if title:
        payload["title"] = title
    if comment:
        payload["comment"] = comment

    if existing:
        client.update_record("reviews", existing["id"], payload)
        return existing["id"]

    created = client.create_record("reviews", payload)
    return created["id"]


def main() -> int:
    env = read_env_file(ENV_PATH)
    pb_url = normalize_pb_url(env.get("POCKETBASE_URL", "http://127.0.0.1:8090"))
    pb_identity = env.get("POCKETBASE_AUTH_IDENTITY", "")
    pb_password = env.get("POCKETBASE_AUTH_PASSWORD", "")
    timeout = int(env.get("POCKETBASE_TIMEOUT_SECONDS", "30"))

    if not pb_identity or not pb_password:
        raise RuntimeError("POCKETBASE_AUTH_IDENTITY and POCKETBASE_AUTH_PASSWORD are required in tienda-back/.env")

    image_files = [
        "logo1.png",
        "logo2.jpg",
        "logo3.png",
        "empresabanner1.png",
        "empresabanner2.png",
        "empresabanner3.png",
        "chamarra1.jpg",
        "chamarra2.jpg",
        "chaamrra3.jpg",
        "gorra1.jpg",
        "gorra2.jpg",
        "gorra3.jpg",
        "pantalon1.jpg",
        "pantalon2.webp",
        "polera.jpg",
        "polera1.jpg",
        "polera2.jpg",
    ]
    ensure_images_exist(image_files)

    client = PocketBaseClient(pb_url, timeout_seconds=timeout)
    client.auth_superuser(pb_identity, pb_password)

    categories = [
        {"name": "Chaquetas", "slug": "chaquetas", "icon": "jacket", "order": 1},
        {"name": "Poleras", "slug": "poleras", "icon": "shirt", "order": 2},
        {"name": "Pantalones", "slug": "pantalones", "icon": "pants", "order": 3},
        {"name": "Gorros", "slug": "gorros", "icon": "beanie", "order": 4},
    ]
    category_ids: Dict[str, str] = {}
    for c in categories:
        category_ids[c["slug"]] = upsert_category(client, c["name"], c["slug"], c["icon"], c["order"])

    vendors = [
        {
            "email": "andes.workwear@tienda-tecno.local",
            "password": "Vendor123!",
            "name": "Andes Workwear",
            "role": "vendor",
        },
        {
            "email": "prime.outdoor@tienda-tecno.local",
            "password": "Vendor123!",
            "name": "Prime Outdoor",
            "role": "vendor",
        },
        {
            "email": "cloud.style@tienda-tecno.local",
            "password": "Vendor123!",
            "name": "Cloud Style",
            "role": "vendor",
        },
        {
            "email": "amazon.basics@tienda-tecno.local",
            "password": "Vendor123!",
            "name": "Amazon Basics BO",
            "role": "vendor",
        },
    ]
    vendor_ids: Dict[str, str] = {}
    for v in vendors:
        vendor_ids[v["name"]] = upsert_user(client, v["email"], v["password"], v["name"], v["role"])

    buyers = [
        {
            "email": "cliente.1@tienda-tecno.local",
            "password": "Cliente123!",
            "name": "Cliente Uno",
            "role": "user",
        },
        {
            "email": "cliente.2@tienda-tecno.local",
            "password": "Cliente123!",
            "name": "Cliente Dos",
            "role": "user",
        },
        {
            "email": "cliente.3@tienda-tecno.local",
            "password": "Cliente123!",
            "name": "Cliente Tres",
            "role": "user",
        },
    ]
    buyer_ids: Dict[str, str] = {}
    for b in buyers:
        buyer_ids[b["name"]] = upsert_user(client, b["email"], b["password"], b["name"], b["role"])

    stores = [
        {
            "name": "Andes Workwear",
            "slug": "andes-workwear",
            "owner_name": "Andes Workwear",
            "location": "La Paz",
            "whatsapp": "59170011001",
            "instagram": "andes_workwear_bo",
            "verified": True,
            "rating": 4.8,
            "reviews_count": 56,
            "payment_instructions": "Pago en BS por QR o transferencia bancaria.",
            "logo_file": "logo1.png",
            "banner_file": "empresabanner1.png",
        },
        {
            "name": "Prime Outdoor",
            "slug": "prime-outdoor",
            "owner_name": "Prime Outdoor",
            "location": "Santa Cruz",
            "whatsapp": "59170011002",
            "instagram": "prime_outdoor_bo",
            "verified": True,
            "rating": 4.7,
            "reviews_count": 49,
            "payment_instructions": "Se acepta pago en BS y entrega en 24 a 48 horas.",
            "logo_file": "logo2.jpg",
            "banner_file": "empresabanner2.png",
        },
        {
            "name": "Cloud Style",
            "slug": "cloud-style",
            "owner_name": "Cloud Style",
            "location": "Cochabamba",
            "whatsapp": "59170011003",
            "instagram": "cloud_style_bo",
            "verified": True,
            "rating": 4.9,
            "reviews_count": 61,
            "payment_instructions": "Pagos en BS por QR, transferencia o efectivo contra entrega.",
            "logo_file": "logo3.png",
            "banner_file": "empresabanner3.png",
        },
        {
            "name": "Amazon Basics BO",
            "slug": "amazon-basics-bo",
            "owner_name": "Amazon Basics BO",
            "location": "El Alto",
            "whatsapp": "59170011004",
            "instagram": "amazon_basics_bo",
            "verified": False,
            "rating": 4.6,
            "reviews_count": 34,
            "payment_instructions": "Solo pagos en BS. Pedido confirmado con comprobante.",
            "logo_file": "logo1.png",
            "banner_file": "empresabanner1.png",
        },
    ]
    store_ids: Dict[str, str] = {}
    for s in stores:
        store_ids[s["slug"]] = upsert_store(
            client,
            name=s["name"],
            slug=s["slug"],
            owner_id=vendor_ids[s["owner_name"]],
            location=s["location"],
            whatsapp=s["whatsapp"],
            instagram=s["instagram"],
            verified=s["verified"],
            rating=s["rating"],
            reviews_count=s["reviews_count"],
            payment_instructions=s["payment_instructions"],
            logo_file=s["logo_file"],
            banner_file=s["banner_file"],
        )

    products = [
        {
            "name": "Chamarra termica amarilla",
            "slug": "chamarra-termica-amarilla",
            "description": "Chamarra termica para frio de altura. Ideal para uso diario en clima frio.",
            "price_bs": 389.0,
            "stock": 14,
            "featured": True,
            "condition": "new",
            "store_slug": "andes-workwear",
            "category_slug": "chaquetas",
            "image_file": "chamarra1.jpg",
        },
        {
            "name": "Chamarra termica negra",
            "slug": "chamarra-termica-negra",
            "description": "Ligera, compacta y resistente. Mantiene calor sin perder movilidad.",
            "price_bs": 369.0,
            "stock": 18,
            "featured": False,
            "condition": "new",
            "store_slug": "andes-workwear",
            "category_slug": "chaquetas",
            "image_file": "chamarra2.jpg",
        },
        {
            "name": "Chamarra termica roja",
            "slug": "chamarra-termica-roja",
            "description": "Modelo urbano con cierre reforzado y tela exterior repelente al agua.",
            "price_bs": 399.0,
            "stock": 11,
            "featured": True,
            "condition": "new",
            "store_slug": "prime-outdoor",
            "category_slug": "chaquetas",
            "image_file": "chaamrra3.jpg",
        },
        {
            "name": "Gorro tejido gris claro",
            "slug": "gorro-tejido-gris-claro",
            "description": "Gorro tejido elastico para frio moderado. Ajuste comodo.",
            "price_bs": 59.0,
            "stock": 35,
            "featured": False,
            "condition": "new",
            "store_slug": "cloud-style",
            "category_slug": "gorros",
            "image_file": "gorra1.jpg",
        },
        {
            "name": "Gorro tejido gris oscuro",
            "slug": "gorro-tejido-gris-oscuro",
            "description": "Acabado premium con punto grueso para mejor conservacion de calor.",
            "price_bs": 65.0,
            "stock": 29,
            "featured": False,
            "condition": "new",
            "store_slug": "cloud-style",
            "category_slug": "gorros",
            "image_file": "gorra2.jpg",
        },
        {
            "name": "Gorro termico negro",
            "slug": "gorro-termico-negro",
            "description": "Diseno simple y termico para uso urbano y actividades al aire libre.",
            "price_bs": 69.0,
            "stock": 26,
            "featured": True,
            "condition": "new",
            "store_slug": "amazon-basics-bo",
            "category_slug": "gorros",
            "image_file": "gorra3.jpg",
        },
        {
            "name": "Pantalon cargo verde",
            "slug": "pantalon-cargo-verde",
            "description": "Pantalon cargo de uso diario con bolsillos laterales y tela durable.",
            "price_bs": 189.0,
            "stock": 22,
            "featured": True,
            "condition": "new",
            "store_slug": "prime-outdoor",
            "category_slug": "pantalones",
            "image_file": "pantalon1.jpg",
        },
        {
            "name": "Pantalon carpintero cafe",
            "slug": "pantalon-carpintero-cafe",
            "description": "Corte recto y costuras reforzadas para trabajo y uso casual.",
            "price_bs": 229.0,
            "stock": 19,
            "featured": True,
            "condition": "new",
            "store_slug": "andes-workwear",
            "category_slug": "pantalones",
            "image_file": "pantalon2.webp",
        },
        {
            "name": "Polera basica roja",
            "slug": "polera-basica-roja",
            "description": "Polera de algodon suave con color solido y ajuste regular.",
            "price_bs": 89.0,
            "stock": 40,
            "featured": False,
            "condition": "new",
            "store_slug": "amazon-basics-bo",
            "category_slug": "poleras",
            "image_file": "polera.jpg",
        },
        {
            "name": "Polera roja deportiva",
            "slug": "polera-roja-deportiva",
            "description": "Tela respirable para entrenamiento y uso urbano diario.",
            "price_bs": 99.0,
            "stock": 33,
            "featured": False,
            "condition": "new",
            "store_slug": "prime-outdoor",
            "category_slug": "poleras",
            "image_file": "polera1.jpg",
        },
        {
            "name": "Polera negra CAT",
            "slug": "polera-negra-cat",
            "description": "Polera negra casual con estampado frontal para look urbano.",
            "price_bs": 109.0,
            "stock": 25,
            "featured": True,
            "condition": "new",
            "store_slug": "cloud-style",
            "category_slug": "poleras",
            "image_file": "polera2.jpg",
        },
        {
            "name": "Pack invierno basico",
            "slug": "pack-invierno-basico",
            "description": "Combo recomendado con gorro y prenda termica para temporada fria.",
            "price_bs": 279.0,
            "stock": 12,
            "featured": True,
            "condition": "new",
            "store_slug": "andes-workwear",
            "category_slug": "chaquetas",
            "image_file": "chamarra1.jpg",
        },
    ]

    product_count = 0
    product_ids: Dict[str, str] = {}
    for p in products:
        product_id = upsert_product(
            client,
            name=p["name"],
            slug=p["slug"],
            description=p["description"],
            price_bs=p["price_bs"],
            stock=p["stock"],
            featured=p["featured"],
            condition=p["condition"],
            store_id=store_ids[p["store_slug"]],
            category_id=category_ids[p["category_slug"]],
            image_file=p["image_file"],
        )
        product_ids[p["slug"]] = product_id
        product_count += 1

    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%SZ")
    end_date = (now + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%SZ")

    auctions = [
        {
            "title": "Subasta Chamarra Roja Prime",
            "store_slug": "prime-outdoor",
            "product_slug": "chamarra-termica-roja",
            "start_price": 280.0,
            "current_price": 330.0,
            "reserve_price": 320.0,
            "buy_now_price": 430.0,
            "image_file": "chaamrra3.jpg",
        },
        {
            "title": "Subasta Chamarra Negra Andes",
            "store_slug": "andes-workwear",
            "product_slug": "chamarra-termica-negra",
            "start_price": 250.0,
            "current_price": 295.0,
            "reserve_price": 290.0,
            "buy_now_price": 390.0,
            "image_file": "chamarra2.jpg",
        },
        {
            "title": "Subasta Pantalon Cargo Verde",
            "store_slug": "prime-outdoor",
            "product_slug": "pantalon-cargo-verde",
            "start_price": 120.0,
            "current_price": 155.0,
            "reserve_price": 150.0,
            "buy_now_price": 220.0,
            "image_file": "pantalon1.jpg",
        },
        {
            "title": "Subasta Pack Invierno Basico",
            "store_slug": "andes-workwear",
            "product_slug": "pack-invierno-basico",
            "start_price": 190.0,
            "current_price": 240.0,
            "reserve_price": 230.0,
            "buy_now_price": 320.0,
            "image_file": "chamarra1.jpg",
        },
    ]

    auction_ids: Dict[str, str] = {}
    for a in auctions:
        auction_id = upsert_auction(
            client,
            title=a["title"],
            store_id=store_ids[a["store_slug"]],
            product_id=product_ids.get(a["product_slug"]),
            start_price=a["start_price"],
            current_price=a["current_price"],
            reserve_price=a["reserve_price"],
            buy_now_price=a["buy_now_price"],
            start_date_iso=start_date,
            end_date_iso=end_date,
            status="active",
            image_file=a["image_file"],
        )
        auction_ids[a["title"]] = auction_id

    bids = [
        {
            "auction_title": "Subasta Chamarra Roja Prime",
            "bidder_name": "Cliente Uno",
            "amount": 315.0,
            "is_auto_bid": False,
            "auto_bid_max": None,
        },
        {
            "auction_title": "Subasta Chamarra Roja Prime",
            "bidder_name": "Cliente Dos",
            "amount": 330.0,
            "is_auto_bid": True,
            "auto_bid_max": 360.0,
        },
        {
            "auction_title": "Subasta Chamarra Negra Andes",
            "bidder_name": "Cliente Tres",
            "amount": 295.0,
            "is_auto_bid": False,
            "auto_bid_max": None,
        },
        {
            "auction_title": "Subasta Pantalon Cargo Verde",
            "bidder_name": "Cliente Uno",
            "amount": 155.0,
            "is_auto_bid": False,
            "auto_bid_max": None,
        },
        {
            "auction_title": "Subasta Pack Invierno Basico",
            "bidder_name": "Cliente Dos",
            "amount": 240.0,
            "is_auto_bid": True,
            "auto_bid_max": 280.0,
        },
    ]

    bid_count = 0
    for b in bids:
        upsert_auction_bid(
            client,
            auction_id=auction_ids[b["auction_title"]],
            bidder_id=buyer_ids[b["bidder_name"]],
            amount=b["amount"],
            is_auto_bid=b["is_auto_bid"],
            auto_bid_max=b["auto_bid_max"],
        )
        bid_count += 1

    reviews = [
        {
            "reviewer_name": "Cliente Uno",
            "product_slug": "chamarra-termica-amarilla",
            "rating": 5.0,
            "title": "Excelente calidad y entrega rapida",
            "comment": "Producto de muy buena calidad, el envio fue rapido y el empaque perfecto. Recomendado!",
        },
        {
            "reviewer_name": "Cliente Dos",
            "product_slug": "chamarra-termica-negra",
            "rating": 4.0,
            "title": "Buena chamarra",
            "comment": "El producto es bueno, pero el color no es exactamente como en la foto.",
        },
        {
            "reviewer_name": "Cliente Tres",
            "product_slug": "chamarra-termica-roja",
            "rating": 5.0,
            "title": "Perfecto para el frio",
            "comment": "Muy calida y comoda. La talla es exacta. Muy recomendado para clima de altura.",
        },
        {
            "reviewer_name": "Cliente Uno",
            "product_slug": "pantalon-cargo-verde",
            "rating": 4.0,
            "title": "Buen pantalon",
            "comment": "Pantalon resistente con buenos bolsillos. Recomendado para trabajo y uso casual.",
        },
        {
            "reviewer_name": "Cliente Dos",
            "product_slug": "gorro-tejido-gris-claro",
            "rating": 5.0,
            "title": "Muy comodo y calido",
            "comment": "Gorro de excelente calidad. Muy blando y elastico. Perfecto precio-calidad.",
        },
        {
            "reviewer_name": "Cliente Tres",
            "product_slug": "polera-basica-roja",
            "rating": 4.0,
            "title": "Polera de calidad",
            "comment": "La polera es suave y el color es intenso. Lavo bien despues de varios lavados.",
        },
        {
            "reviewer_name": "Cliente Uno",
            "product_slug": "polera-roja-deportiva",
            "rating": 5.0,
            "title": "Perfecta para entrenar",
            "comment": "Tela transpirable y comoda. He entrenado varias veces y sigue como nueva.",
        },
        {
            "reviewer_name": "Cliente Dos",
            "product_slug": "polera-negra-cat",
            "rating": 4.0,
            "title": "Buen diseno",
            "comment": "Estampado bien hecho. La polera es de buena tela. Muy contento con la compra.",
        },
        {
            "reviewer_name": "Cliente Tres",
            "product_slug": "pantalon-carpintero-cafe",
            "rating": 5.0,
            "title": "Pantalon muy durable",
            "comment": "Costuras resistentes y tela de buena calidad. Ideal para trabajo pesado.",
        },
        {
            "reviewer_name": "Cliente Uno",
            "product_slug": "gorro-tejido-gris-oscuro",
            "rating": 4.0,
            "title": "Muy calido",
            "comment": "Gorro con punto grueso muy efectivo para guardar calor. Recomendado.",
        },
        {
            "reviewer_name": "Cliente Dos",
            "product_slug": "gorro-termico-negro",
            "rating": 5.0,
            "title": "Excellent producto",
            "comment": "Simple pero muy efectivo. Mantiene el calor sin incomodar. Muy buen precio.",
        },
        {
            "reviewer_name": "Cliente Tres",
            "product_slug": "pack-invierno-basico",
            "rating": 5.0,
            "title": "Pack recomendado",
            "comment": "Excelente combo para el invierno. Los dos articulos son de buena calidad. Muy buena compra.",
        },
    ]

    review_count = 0
    for r in reviews:
        if r["product_slug"] in product_ids and r["reviewer_name"] in buyer_ids:
            upsert_review(
                client,
                reviewer_id=buyer_ids[r["reviewer_name"]],
                product_id=product_ids[r["product_slug"]],
                rating=r["rating"],
                title=r["title"],
                comment=r["comment"],
                verified_purchase=True,
            )
            review_count += 1

    print("Seed finished")
    print(f"Base URL: {pb_url}")
    print(f"Categories upserted: {len(categories)}")
    print(f"Stores upserted: {len(stores)}")
    print(f"Products upserted: {product_count}")
    print(f"Auctions upserted: {len(auctions)}")
    print(f"Auction bids upserted: {bid_count}")
    print(f"Reviews upserted: {review_count}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
