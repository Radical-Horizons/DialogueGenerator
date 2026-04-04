"""Tests pour le middleware de cache HTTP."""
import os
import pytest
import time
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.middleware.http_cache import HTTPCacheMiddleware, setup_http_cache
from unittest.mock import patch


@pytest.fixture
def app_with_cache():
    """Application FastAPI avec cache HTTP."""
    app = FastAPI()
    
    @app.get("/api/v1/cache-test")
    def test_endpoint():
        return {"message": "test"}
    
    @app.get("/api/v1/context/characters")
    def test_gdd_endpoint():
        return {"characters": [{"name": "Test"}]}
    
    @app.get("/api/v1/interactions")
    def test_dynamic_endpoint():
        return {"interactions": []}
    
    app.add_middleware(
        HTTPCacheMiddleware,
        enabled=True,
        ttl_gdd=1,  # 1 seconde pour les tests
        ttl_static=2,  # 2 secondes pour les tests
        max_size=100
    )
    
    return app


def test_cache_hit(app_with_cache):
    """Test que le cache fonctionne (cache hit)."""
    client = TestClient(app_with_cache)
    
    # Première requête (cache miss)
    response1 = client.get("/api/v1/cache-test")
    assert response1.status_code == 200
    assert response1.headers.get("X-Cache") == "MISS"
    
    # Deuxième requête (cache hit)
    response2 = client.get("/api/v1/cache-test")
    assert response2.status_code == 200
    assert response2.headers.get("X-Cache") == "HIT"
    assert response2.json() == response1.json()


def test_cache_ttl_expiration(app_with_cache):
    """Test que le cache expire après TTL."""
    client = TestClient(app_with_cache)
    
    # Première requête
    response1 = client.get("/api/v1/cache-test")
    assert response1.status_code == 200
    assert response1.headers.get("X-Cache") == "MISS"
    
    # Deuxième requête immédiatement (cache hit)
    response2 = client.get("/api/v1/cache-test")
    assert response2.headers.get("X-Cache") == "HIT"
    
    # Attendre que le TTL expire (2 secondes pour static)
    time.sleep(2.1)
    
    # Troisième requête (cache miss car expiré)
    response3 = client.get("/api/v1/cache-test")
    assert response3.headers.get("X-Cache") == "MISS"


def test_cache_gdd_ttl(app_with_cache):
    """Test que les endpoints GDD utilisent le TTL GDD."""
    client = TestClient(app_with_cache)
    
    # Première requête
    response1 = client.get("/api/v1/context/characters")
    assert response1.status_code == 200
    assert response1.headers.get("X-Cache") == "MISS"
    assert "Cache-Control" in response1.headers
    
    # Deuxième requête immédiatement (cache hit)
    response2 = client.get("/api/v1/context/characters")
    assert response2.headers.get("X-Cache") == "HIT"
    
    # Attendre que le TTL GDD expire (1 seconde)
    time.sleep(1.1)
    
    # Troisième requête (cache miss car expiré)
    response3 = client.get("/api/v1/context/characters")
    assert response3.headers.get("X-Cache") == "MISS"


def test_cache_not_applied_to_dynamic_endpoints(app_with_cache):
    """Test que le cache n'est pas appliqué aux endpoints dynamiques."""
    client = TestClient(app_with_cache)
    
    # Les endpoints d'interactions ne devraient pas être mis en cache
    response1 = client.get("/api/v1/interactions")
    assert response1.status_code == 200
    assert "X-Cache" not in response1.headers or response1.headers.get("X-Cache") != "HIT"
    
    # Deuxième requête ne devrait pas être en cache
    response2 = client.get("/api/v1/interactions")
    assert response2.status_code == 200
    assert "X-Cache" not in response2.headers or response2.headers.get("X-Cache") != "HIT"


def test_cache_not_applied_to_post(app_with_cache):
    """Test que le cache n'est pas appliqué aux requêtes POST."""
    client = TestClient(app_with_cache)
    
    @app_with_cache.post("/api/v1/test-post")
    def test_post():
        return {"message": "post"}
    
    response1 = app_with_cache.post("/api/v1/test-post")
    # POST ne devrait pas être mis en cache
    # (mais on ne peut pas tester facilement avec TestClient pour POST)


def test_etag_support(app_with_cache):
    """Test le support ETag."""
    client = TestClient(app_with_cache)
    
    # Première requête
    response1 = client.get("/api/v1/cache-test")
    assert response1.status_code == 200
    etag = response1.headers.get("ETag")
    assert etag is not None
    
    # Deuxième requête avec If-None-Match
    response2 = client.get(
        "/api/v1/cache-test",
        headers={"If-None-Match": etag}
    )
    assert response2.status_code == 304  # Not Modified
    assert response2.headers.get("ETag") == etag


def test_cache_disabled():
    """Test que le cache peut être désactivé."""
    app = FastAPI()
    
    @app.get("/api/v1/cache-test")
    def test_endpoint():
        return {"message": "test"}
    
    app.add_middleware(
        HTTPCacheMiddleware,
        enabled=False,
        ttl_gdd=1,
        ttl_static=2,
        max_size=100
    )
    
    client = TestClient(app)
    
    # Première requête
    response1 = client.get("/api/v1/cache-test")
    assert response1.status_code == 200
    assert "X-Cache" not in response1.headers
    
    # Deuxième requête ne devrait pas être en cache
    response2 = client.get("/api/v1/cache-test")
    assert response2.status_code == 200
    assert "X-Cache" not in response2.headers


def test_non_api_get_not_cached():
    """Le shell SPA et tout chemin hors /api/ ne doivent pas passer par HTTPCacheMiddleware."""
    app = FastAPI()

    @app.get("/")
    def root():
        return "<html></html>"

    app.add_middleware(
        HTTPCacheMiddleware,
        enabled=True,
        ttl_gdd=1,
        ttl_static=60,
        max_size=100,
    )
    client = TestClient(app)
    r1 = client.get("/")
    r2 = client.get("/")
    assert r1.status_code == 200
    assert "X-Cache" not in r1.headers
    assert "X-Cache" not in r2.headers


def test_setup_http_cache():
    """Test setup_http_cache."""
    app = FastAPI()
    
    with patch.dict(os.environ, {
        "HTTP_CACHE_ENABLED": "true",
        "HTTP_CACHE_TTL_GDD": "30",
        "HTTP_CACHE_TTL_STATIC": "300",
        "HTTP_CACHE_MAX_SIZE": "1000"
    }, clear=True):
        setup_http_cache(app)
        
        # Vérifier que le middleware a été ajouté
        # (on ne peut pas facilement vérifier directement, mais on peut tester que l'app fonctionne)
        client = TestClient(app)
        # L'app devrait fonctionner même sans routes définies (404)
        response = client.get("/nonexistent")
        assert response.status_code == 404



