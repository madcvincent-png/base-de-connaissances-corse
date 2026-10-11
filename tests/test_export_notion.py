"""Le convertisseur Notion -> raw.json doit produire exactement ce que lit build_data.py."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_data  # noqa: E402
import export_notion as X  # noqa: E402


def rt(texte, **kw):
    m = {"type": "text", "plain_text": texte, "text": {"content": texte, "link": None}, "annotations": {}, "href": None}
    m.update(kw)
    return m


PAGE = {
    "id": "3f6cf61f-b4e7-81af-9a0b-ed7129127e31",
    "properties": {
        "Titre": {"type": "title", "title": [rt("Note de conjoncture")]},
        "Résumé": {"type": "rich_text", "rich_text": [rt("Voir "), rt("Insee", href="https://www.insee.fr/x")]},
        "Producteur": {"type": "select", "select": {"name": "Insee"}},
        "Thèmes": {"type": "multi_select", "multi_select": [{"name": "Économie"}, {"name": "Social"}]},
        "Dossiers": {"type": "relation", "relation": [{"id": "3f4cf61f-b4e7-816a-ad7c-eb107ab27ea0"}]},
        "Date de publication": {"type": "date", "date": {"start": "2026-09-24", "end": None}},
        "Vérifié le": {"type": "date", "date": None},
        "Jalon majeur": {"type": "checkbox", "checkbox": True},
        "Population": {"type": "number", "number": 37},
        "Lien": {"type": "url", "url": "https://www.insee.fr/fr/statistiques/9051935"},
        "Nb": {"type": "rollup", "rollup": {"type": "number", "number": 3}},
    },
}


def test_aplatir_formats():
    l = X.aplatir(PAGE)
    assert l["url"] == "https://app.notion.com/p/3f6cf61fb4e781af9a0bed7129127e31"
    assert l["Titre"] == "Note de conjoncture"
    assert l["Résumé"] == "Voir [Insee](https://www.insee.fr/x)"
    assert l["Producteur"] == "Insee"
    assert json.loads(l["Thèmes"]) == ["Économie", "Social"]
    assert json.loads(l["Dossiers"]) == ["https://app.notion.com/p/3f4cf61fb4e7816aad7ceb107ab27ea0"]
    assert l["date:Date de publication:start"] == "2026-09-24" and l["date:Date de publication:is_datetime"] == 0
    assert "date:Vérifié le:start" not in l
    assert l["Jalon majeur"] == "__YES__" and l["Population"] == 37
    assert "Nb" not in l


def test_relation_lue_par_build_data():
    l = X.aplatir(PAGE)
    assert build_data.rel(l["Dossiers"]) == ["3f4cf61fb4e7816aad7ceb107ab27ea0"]


class FauxNotion:
    def enfants(self, bloc):
        return [{"type": "table_row", "table_row": {"cells": [[rt("Période")], [rt("Valeur")]]}},
                {"type": "table_row", "table_row": {"cells": [[rt("T2 2026")], [rt("6,9 %")]]}}]


def test_blocs_vers_html():
    blocs = [
        {"type": "callout", "callout": {"rich_text": [rt("À relire")]}},
        {"type": "heading_2", "heading_2": {"rich_text": [rt("L'essentiel")]}},
        {"type": "paragraph", "paragraph": {"rich_text": [rt("Texte "), rt("gras", annotations={"bold": True})]}},
        {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [rt("point")]}},
        {"type": "table", "id": "t1", "table": {}},
        {"type": "heading_2", "heading_2": {"rich_text": [rt("Ce qu'il faut dire à l'antenne")]}},
        {"type": "paragraph", "paragraph": {"rich_text": [rt("Formule à reprendre")]}},
    ]
    texte = X.blocs_en_texte(FauxNotion(), blocs)
    h = build_data.note_html(texte, {})
    assert '<div class="avertissement" role="note">' in h
    assert "<h2>L'essentiel</h2>" in h and "<strong>gras</strong>" in h and "<li>point</li>" in h
    assert "<th>Période</th>" in h and "<td>6,9 %</td>" in h
    # aucune consigne d'expression orale ne passe sur le site
    assert "antenne" not in h and "Formule à reprendre" not in h
