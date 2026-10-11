"""Contrôle de fumée du site : chaque page se charge sans erreur JavaScript, affiche du contenu
et ne présente aucun défaut d'accessibilité grave ou critique selon axe-core.

    AXE_JS=node_modules/axe-core/axe.min.js python -m pytest tests/test_site.py
"""
import functools
import http.server
import os
import threading
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
AXE = Path(os.environ.get("AXE_JS", RACINE / "node_modules/axe-core/axe.min.js"))
PAGES = ["index.html", "carte.html", "communes.html", "commune.html?code=2A004", "chronologie.html", "agenda.html",
         "dossiers.html", "repertoire.html", "elus.html", "sites.html", "sites.html?vue=patrimoine", "documents.html",
         "articles.html", "notes.html", "drones.html", "a-propos.html"]


@pytest.fixture(scope="module")
def serveur():
    gestion = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(RACINE))
    gestion.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), gestion)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{s.server_address[1]}"
    s.shutdown()


@pytest.fixture(scope="module")
def navigateur():
    playwright = pytest.importorskip("playwright.sync_api")
    with playwright.sync_playwright() as p:
        chemin = os.environ.get("CHROMIUM")
        b = p.chromium.launch(**({"executable_path": chemin} if chemin else {}), args=["--no-sandbox"])
        yield b
        b.close()


@pytest.mark.parametrize("page", PAGES)
@pytest.mark.parametrize("largeur", [1366, 390])
def test_page(serveur, navigateur, page, largeur):
    p = navigateur.new_page(viewport={"width": largeur, "height": 900})
    erreurs = []
    p.on("pageerror", lambda e: erreurs.append(str(e)))
    p.goto(f"{serveur}/{page}")
    p.wait_for_timeout(600)
    assert not erreurs, erreurs
    assert len(p.inner_text("#page")) > 200, "page presque vide"
    assert p.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "défilement horizontal"
    if AXE.exists() and largeur == 1366:
        p.add_script_tag(path=str(AXE))
        graves = p.evaluate("""async () => (await axe.run(document, {resultTypes: ['violations']})).violations
            .filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + ' (' + v.nodes.length + ')')""")
        assert not graves, graves
    p.close()
