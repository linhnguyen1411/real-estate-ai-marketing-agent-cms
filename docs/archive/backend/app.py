# -*- coding: utf-8 -*-
# @license
# SPDX-License-Identifier: Apache-2.0
import os
import json
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(
    title="Real Estate AI Marketing Agent CMS API",
    description="Python FastAPI backend alternative optimized for AI agent CMS workflows.",
    version="1.0.0"
)

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_path() -> str:
    # Look for database file in workspace
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = os.path.join(base_dir, "db.json")
    if os.path.exists(target):
        return target
    # Fallback to current directory
    return os.path.join(os.getcwd(), "db.json")

def read_db() -> Dict[str, Any]:
    path = get_db_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"Error reading DB: {e}")
    
    return {
        "customers": [],
        "properties": [],
        "posts": [],
        "inbox": [],
        "automations": [],
        "settings": {
            "ai_mode": "gemini",
            "ollama_endpoint": "http://localhost:11434",
            "ollama_model": "qwen2.5",
            "agent_tone": "sang trọng và chuyên nghiệp"
        }
    }

def write_db(data: Dict[str, Any]) -> bool:
    path = get_db_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error writing DB: {e}")
        return False

# Pydantic schemas for verification
class CustomerModel(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    source: str = "facebook"
    budget: float = 5.0
    interested_area: str = "Hòa Xuân, Cẩm Lệ"
    property_type: str = "đất nền"
    status: str = "new"
    notes: Optional[str] = ""

class PropertyModel(BaseModel):
    title: str
    type: str = "đất"
    location: str
    area: float
    price: float
    legal_status: str = "Sổ hồng riêng"
    direction: str = "Đông"
    road_width: float
    description: str
    images: Optional[str] = None
    selling_points: Optional[List[str]] = []

@app.get("/")
def read_root():
    return {"message": "Python FastAPI backend works flawlessly!", "status": "online"}

# 1. GET /api/dashboard
@app.get("/api/dashboard")
def get_dashboard():
    db = read_db()
    total_customers = len(db.get("customers", []))
    hot_leads = sum(1 for c in db.get("customers", []) if c.get("status") == "hot")
    warm_leads = sum(1 for c in db.get("customers", []) if c.get("status") == "warm")
    cold_leads = sum(1 for c in db.get("customers", []) if c.get("status") == "new")
    
    return {
        "status": "success",
        "data": {
            "stats": {
                "totalCustomers": total_customers,
                "leads": {"hot": hot_leads, "warm": warm_leads, "cold": cold_leads},
                "totalProperties": len(db.get("properties", [])),
                "totalPosts": len(db.get("posts", [])),
                "pendingInbox": sum(1 for i in db.get("inbox", []) if i.get("status") == "pending")
            }
        }
    }

# 2. Customers CRM CRUD
@app.get("/api/customers")
def get_customers():
    return {"status": "success", "data": read_db().get("customers", [])}

@app.post("/api/customers")
def create_customer(customer: CustomerModel):
    db = read_db()
    new_id = f"c-{int(time.time())}"
    
    new_cust = {
        "id": new_id,
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "source": customer.source,
        "budget": customer.budget,
        "interested_area": customer.interested_area,
        "property_type": customer.property_type,
        "status": customer.status,
        "notes": customer.notes,
        "ai_summary": "Chưa hoàn tất phân tích",
        "lead_score": 50,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    db.setdefault("customers", []).append(new_cust)
    write_db(db)
    return {"status": "success", "data": new_cust}

# 3. Properties Storage CRUD
@app.get("/api/properties")
def get_properties():
    return {"status": "success", "data": read_db().get("properties", [])}

@app.post("/api/properties")
def create_property(prop: PropertyModel):
    db = read_db()
    new_id = f"p-{int(time.time())}"
    
    new_prop = {
        "id": new_id,
        "title": prop.title,
        "type": prop.type,
        "location": prop.location,
        "area": prop.area,
        "price": prop.price,
        "legal_status": prop.legal_status,
        "direction": prop.direction,
        "road_width": prop.road_width,
        "description": prop.description,
        "images": prop.images or "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
        "selling_points": prop.selling_points or ["Vị trí đắc địa"]
    }
    
    db.setdefault("properties", []).append(new_prop)
    write_db(db)
    return {"status": "success", "data": new_prop}

# 4. Posts CRUD
@app.get("/api/posts")
def get_posts():
    return {"status": "success", "data": read_db().get("posts", [])}

# 5. Inbox multi-channel
@app.get("/api/inbox")
def get_inbox():
    return {"status": "success", "data": read_db().get("inbox", [])}

# 6. Ollama Integrations Chatbot (Fallback helper)
@app.post("/api/ai/chat")
async def ai_chat(payload: dict = Body(...)):
    message = payload.get("message", "")
    db = read_db()
    settings = db.get("settings", {})
    endpoint = f"{settings.get('ollama_endpoint', 'http://localhost:11434')}/api/chat"
    model = settings.get("ollama_model", "qwen2.5")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                endpoint,
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "Bạn là trưởng bộ phận tư vấn cấp cao bất động sản tại miền Trung, sử dụng tiếng Việt hoàn hảo."},
                        {"role": "user", "content": message}
                    ],
                    "stream": False
                }
            )
            if response.status_code == 200:
                res_json = response.json()
                return {"status": "success", "data": res_json["message"]["content"]}
    except Exception as e:
        print(f"Ollama local connection skipped: {e}")
        
    # Local mockup AI answers
    return {
        "status": "success", 
        "data": "Hệ thống AI Agent (Chạy mockup Python FastAPI): Tôi đã tiếp nhận yêu cầu của quý khách. "
                "Hiện trục đường tấp nập Võ Chí Công đang mở bán nhiều dự án giá trị cao chiết khấu tới 5%!"
    }

if __name__ == "__main__":
    import uvicorn
    print("=========================================================")
    print("🚀 Python FastAPI backend model loaded! Run on port 8000")
    print("=========================================================")
    uvicorn.run(app, host="0.0.0.0", port=8000)
