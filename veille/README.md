# Veille RSS vers Notion

Toutes les heures, une tâche GitHub Actions lit les flux de `veille/sources.json`. Elle garde les articles parus dans les 48 dernières heures qui touchent un dossier en « Veille active », et les écrit dans la base Notion « Articles — revue de presse » avec :

- le titre, le lien, le chapeau du flux (repris tel quel), l'auteur s'il est donné ;
- la **date de parution** du flux ;
- le statut « À dépouiller » ;
- les **dossiers** reconnus et la rubrique du plus prioritaire ;
- les **communes** nommées dans le titre.

Un article déjà présent (même lien, paramètres de suivi retirés) n'est pas recréé.

## Règle de rattachement

Les mots-clés viennent du champ « Mots-clés et variantes » de chaque dossier. Ils sont séparés par des points-virgules. Une parenthèse d'un seul mot à majuscule est une variante (« Vero (Véro) »). Les autres parenthèses et ce qui suit « : » sont des commentaires, ignorés.

Un article est rattaché à un dossier quand son titre ou son chapeau contient :

- un nom propre ou un sigle du dossier (« Air Corsica », « SNPL », « Orsoni ») ;
- ou deux termes distincts, dont au moins un n'est pas un lieu (« Ajaccio » et « pêche »).

Un lieu seul ne suffit jamais. Les sigles sont cherchés en respectant la casse.

Mesure sur les 115 articles déjà indexés à la main, sur leur titre seul : **97 % des rattachements proposés sont justes, mais seulement 22 % des rattachements faits à la main sont retrouvés.** La plupart des manques concernent des dossiers larges dont les mots-clés n'apparaissent pas dans les titres. Pour améliorer le rappel, il faut enrichir les mots-clés de ces dossiers, pas abaisser le seuil.

## Mise en service

1. **Créer une intégration Notion** dédiée (Paramètres, Connexions, Développer ses intégrations), de type interne. Copier son jeton secret.
2. **Lui donner accès** aux bases Articles, Dossiers thématiques et Communes : sur la page « Documentation — Revue de presse », menu « … », Connexions, ajouter l'intégration.
3. **Ajouter le secret** dans GitHub : Settings, Secrets and variables, Actions, New repository secret, nom `NOTION_TOKEN`.
4. **Fusionner** cette branche dans `main` : GitHub ne lance les tâches planifiées que depuis la branche par défaut.
5. **Premier essai** : onglet Actions, « Veille RSS vers Notion », Run workflow, case « Essai » cochée. Le journal affiche les compteurs sans rien écrire.
6. Si les compteurs sont plausibles, relancer sans la case : la tâche horaire prend ensuite le relais.

## Confidentialité

Le dépôt est public, donc les journaux d'exécution aussi. Le script n'y écrit que des compteurs : jamais un titre d'article, un nom de dossier ou un mot-clé. Les dossiers et leurs mots-clés sont lus dans Notion à chaque passage et ne sont jamais enregistrés dans le dépôt.

## Limites

- GitHub suspend les tâches planifiées d'un dépôt public après 60 jours sans activité. Un courriel prévient avant la suspension.
- Un flux en panne n'arrête pas la collecte. Si tous les flux échouent, la tâche échoue et GitHub vous en avertit.
- Les entrées datées dans le futur (cela arrive chez Corse Net Infos) sont reprises au passage qui suit leur date.
- Au plus 40 articles sont écrits par passage. Au-delà, le reste est repris au passage suivant.
