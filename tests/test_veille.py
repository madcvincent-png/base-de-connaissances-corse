"""Tests hors ligne du collecteur : aucun accès réseau, aucune écriture dans Notion.

    python3 -m unittest discover -s tests
"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import veille as V  # noqa: E402

MAINTENANT = dt.datetime(2026, 10, 11, 15, 0, tzinfo=dt.timezone.utc)
COMMUNES = [("Ajaccio", "c-ajaccio"), ("Bastia", "c-bastia"), ("Vero", "c-vero"), ("Corte", "c-corte")]
COMMUNES_NORM = {V.norm(n).strip() for n, _ in COMMUNES}

FLUX = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Démo</title>
<item><title>Air Corsica : le préavis de grève des pilotes prolongé</title>
  <link>https://exemple.corsica/air-corsica?utm_source=rss&amp;id=4</link>
  <description>&lt;p&gt;Le &lt;b&gt;SNPL&lt;/b&gt; maintient son mot d'ordre à Ajaccio.&lt;/p&gt;</description>
  <pubDate>Sun, 11 Oct 2026 08:00:00 +0200</pubDate></item>
<item><title>Fête de la châtaigne à Bocognano</title><link>https://exemple.corsica/chataigne</link>
  <pubDate>Sun, 11 Oct 2026 07:00:00 +0200</pubDate></item>
<item><title>Air Corsica : article ancien</title><link>https://exemple.corsica/ancien</link>
  <pubDate>Mon, 01 Sep 2026 07:00:00 +0200</pubDate></item>
<item><title>Air Corsica : article daté dans le futur</title><link>https://exemple.corsica/futur</link>
  <pubDate>Wed, 14 Oct 2026 18:00:00 +0200</pubDate></item>
<item><title>Air Corsica : même lien, autre suivi</title>
  <link>https://exemple.corsica/air-corsica?id=4&amp;utm_medium=x</link>
  <pubDate>Sun, 11 Oct 2026 09:00:00 +0200</pubDate></item>
</channel></rss>"""

GOOGLE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Corse - Google Actualités</title>
<item><title>Alain Orsoni : l'enquête avance - Le Monde</title><link>https://news.google.com/rss/articles/abc</link>
  <pubDate>Sun, 11 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.lemonde.fr">Le Monde</source></item>
<item><title>Orsoni : nouvel élément - Un média inconnu</title><link>https://news.google.com/rss/articles/def</link>
  <pubDate>Sun, 11 Oct 2026 10:00:00 GMT</pubDate><source url="https://inconnu.fr">Un média inconnu</source></item>
</channel></rss>"""


def dossiers():
    return [
        V.Dossier("d-air", "Desserte aérienne", "Air Corsica ; SNPL ; pilotes ; grève ; Ajaccio", "Transports", "Haute", COMMUNES_NORM),
        V.Dossier("d-orsoni", "Affaire Orsoni", "Orsoni ; Vero (Véro) ; Guy Orsoni (fils) : attention à l'homonymie ; assassinat",
                  "Justice", "Haute", COMMUNES_NORM),
        V.Dossier("d-peche", "Pêche", "pêche ; pêcheurs ; Ajaccio", "Économie", "Basse", COMMUNES_NORM),
    ]


class MotsCles(unittest.TestCase):
    def test_variantes_et_annotations(self):
        mots = V.lire_mots_cles("Orsoni ; Vero (Véro) ; Guy Orsoni (fils) : attention à l'homonymie ; « Statu francese assassinu » ; Aldrovendi (coquille)")
        self.assertEqual(mots, ["Orsoni", "Vero", "Véro", "Guy Orsoni", "Statu francese assassinu", "Aldrovendi"])

    def test_classement(self):
        self.assertEqual(V.classer("SNPL", COMMUNES_NORM), "sigle")
        self.assertEqual(V.classer("Ajaccio", COMMUNES_NORM), "lieu")
        self.assertEqual(V.classer("Corse", COMMUNES_NORM), "lieu")
        self.assertEqual(V.classer("Air Corsica", COMMUNES_NORM), "fort")
        self.assertEqual(V.classer("pêcheurs", COMMUNES_NORM), "faible")

    def test_seuil(self):
        peche = dossiers()[2]
        cas = {
            "Les pêcheurs inquiets": False,               # un seul terme faible
            "À Ajaccio, la pêche en difficulté": True,    # un lieu et un terme faible
            "Ajaccio : conseil municipal": False,         # un lieu seul
            "Pêche : les pêcheurs manifestent": True,     # deux termes faibles
        }
        for texte, attendu in cas.items():
            self.assertEqual(bool(peche.correspond(texte, V.norm(texte))), attendu, texte)

    def test_sigle_sensible_a_la_casse(self):
        air = dossiers()[0]
        self.assertTrue(air.correspond("Le SNPL appelle", V.norm("Le SNPL appelle")))
        self.assertFalse(any(g == "sigle" for _, g in air.correspond("snpl", V.norm("snpl"))))

    def test_accents_et_apostrophes(self):
        orsoni = dossiers()[1]
        texte = "A Véro, l’hommage"  # « Véro » est une commune : un lieu seul ne suffit pas
        self.assertEqual(orsoni.correspond(texte, V.norm(texte)), [])
        for texte in ("Assassinat d'Alain Orsoni", "L’enquête sur l’assassinat d’Orsoni"):
            self.assertTrue(orsoni.correspond(texte, V.norm(texte)), texte)


class Flux(unittest.TestCase):
    def test_lecture_et_tri(self):
        arts = V.lire_flux({"nom": "Démo", "url": "", "source": "Corse Net Infos", "type": "Site d'information"}, FLUX)
        self.assertEqual(len(arts), 5)
        self.assertEqual(arts[0]["lien"], "https://exemple.corsica/air-corsica?id=4")
        self.assertEqual(arts[0]["chapeau"], "Le SNPL maintient son mot d'ordre à Ajaccio.")
        retenus, c = V.trier(arts, dossiers(), COMMUNES, MAINTENANT, 48)
        self.assertEqual(c["dates_futures"], 1)
        self.assertEqual(c["trop_anciens"], 1)
        self.assertEqual(c["hors_veille"], 1)  # la châtaigne
        self.assertEqual(len(retenus), 1)       # le doublon de lien est écarté
        art, touches, communes = retenus[0]
        self.assertEqual({d.id for d in touches}, {"d-air"})
        self.assertEqual(communes, [])           # « Ajaccio » est dans le chapeau, pas dans le titre

    def test_agregateur(self):
        arts = V.lire_flux({"nom": "Google", "url": "", "source": "Autre", "agregateur": True}, GOOGLE)
        self.assertEqual([a["source"] for a in arts], ["Le Monde", "Autre"])

    def test_proprietes(self):
        arts = V.lire_flux({"nom": "Démo", "url": "", "source": "Corse Net Infos", "type": "Site d'information"}, FLUX)
        retenus, _ = V.trier(arts, dossiers(), COMMUNES, MAINTENANT, 48)
        art, touches, _ = retenus[0]
        p = V.proprietes_article(art, touches, ["c-ajaccio"])
        self.assertEqual(p["Date de parution"]["date"]["start"], "2026-10-11")
        self.assertEqual(p["Traitement"]["select"]["name"], "À dépouiller")
        self.assertEqual(p["Rubrique"]["select"]["name"], "Transports")
        self.assertEqual(p["Dossiers"]["relation"], [{"id": "d-air"}])
        self.assertEqual(p["Communes"]["relation"], [{"id": "c-ajaccio"}])

    def test_communes_dans_le_titre(self):
        self.assertEqual(V.communes_citees("Conseil municipal de Bastia", COMMUNES), ["c-bastia"])
        # Un nom accolé par un trait d'union (« Corte-Bastia ») n'est pas retenu : prudence voulue,
        # pour ne pas confondre « Corte » avec un nom composé.
        self.assertEqual(V.communes_citees("Corte-Bastia : la route", COMMUNES), [])
        self.assertEqual(V.communes_citees("Vero", COMMUNES), [])  # moins de cinq lettres


class Sources(unittest.TestCase):
    def test_fichier_des_sources_valide(self):
        chemin = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "veille", "sources.json")
        sources = V.charger_sources(chemin)
        self.assertTrue(sources)
        self.assertEqual(len({s["url"] for s in sources}), len(sources))


if __name__ == "__main__":
    unittest.main()
