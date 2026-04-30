from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ehr_routes import router as ehr_router
from db_init import init_db

init_db()

app = FastAPI(title="EHR Fabric API", version="3.0")

# CORS must be added BEFORE including routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include router ONCE, AFTER middleware
app.include_router(ehr_router)

@app.get("/")
def root():
    return {"message": "EHR Fabric API running"}