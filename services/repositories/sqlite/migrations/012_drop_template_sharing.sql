-- Retrait du partage nominatif et du marketplace de templates.
--
-- La visibilité d'un template tient désormais à son fichier : `ownerId` et
-- `visibility` (shared | private). Il n'y a plus d'ACL en base, donc plus de
-- tables à tenir cohérentes avec les JSON sur disque.
--
-- Ces tables n'ont jamais été déployées en production (Epic 6 non mergée) :
-- aucune donnée utilisateur n'est perdue.

DROP TABLE IF EXISTS template_marketplace_comments;
DROP TABLE IF EXISTS template_ratings;
DROP TABLE IF EXISTS shared_templates;
DROP TABLE IF EXISTS template_shares;
