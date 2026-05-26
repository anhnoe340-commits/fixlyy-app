-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue centralisé des raisons d'appel entrantes
-- Lecture seule pour les artisans — écriture service_role uniquement
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE reasons_catalog (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text        NOT NULL UNIQUE,
  label                text        NOT NULL,
  description          text        NOT NULL,
  category             text        NOT NULL,
  is_emergency         boolean     NOT NULL DEFAULT false,
  default_questions    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sort_order           int         NOT NULL DEFAULT 0,
  is_active_in_catalog boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reasons_catalog_category ON reasons_catalog (category, sort_order);
CREATE INDEX idx_reasons_catalog_active   ON reasons_catalog (is_active_in_catalog)
  WHERE is_active_in_catalog = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_reasons_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reasons_catalog_updated_at
  BEFORE UPDATE ON reasons_catalog
  FOR EACH ROW EXECUTE FUNCTION update_reasons_catalog_updated_at();

-- RLS : SELECT pour tous les authentifiés, écriture service_role uniquement
ALTER TABLE reasons_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_select_authenticated" ON reasons_catalog
  FOR SELECT USING (auth.role() = 'authenticated');
-- Aucune politique INSERT/UPDATE/DELETE → bloquées pour tous les rôles user
-- (service_role bypass RLS automatiquement)

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED : 69 raisons groupées par catégorie
-- is_emergency = true : Dégât des eaux, Urgence, Urgence C&S, Panne courant,
--                       Désinfectation après décès, Frelons/guêpes, Punaises de lit
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO reasons_catalog (slug, label, description, category, is_emergency, sort_order) VALUES

-- ── Chauffage & Sanitaire (14) ───────────────────────────────────────────────
('appel-fournisseur',
 'Appel fournisseur',
 'Le fournisseur appelle concernant la livraison ou la commande.',
 'Chauffage & Sanitaire', false, 1),

('demande-consultation',
 'Demande de consultation',
 'Capture une consultation sur le sujet souhaité.',
 'Chauffage & Sanitaire', false, 2),

('degat-des-eaux',
 'Dégât des eaux ou rupture de canalisation',
 'Enregistrement de la demande concernant un dégât des eaux ou une rupture de canalisation.',
 'Chauffage & Sanitaire', true, 3),

('demande-nouveau-chauffage',
 'Demande de nouveau chauffage',
 'Enregistre une demande pour un nouveau chauffage.',
 'Chauffage & Sanitaire', false, 4),

('demande-nouveau-climatiseur',
 'Demande de nouveau climatiseur',
 'Enregistre une demande pour un nouveau climatiseur.',
 'Chauffage & Sanitaire', false, 5),

('demande-nouvel-adoucisseur-eau',
 'Demande de nouvel adoucisseur d''eau',
 'Enregistre une demande pour un nouveau système d''adoucissement de l''eau.',
 'Chauffage & Sanitaire', false, 6),

('demande-nouvelle-pompe-chaleur',
 'Demande de nouvelle pompe à chaleur',
 'Enregistre une demande pour une nouvelle pompe à chaleur.',
 'Chauffage & Sanitaire', false, 7),

('demande-nouvelle-salle-bain',
 'Demande de nouvelle salle de bain / rénovation de salle de bain',
 'Enregistre une demande pour une nouvelle salle de bain ou une rénovation de salle de bain.',
 'Chauffage & Sanitaire', false, 8),

('entretien-installation',
 'Entretien de l''installation',
 'Enregistre une demande de maintenance d''un chauffage, d''une pompe à chaleur, de panneaux photovoltaïques, d''une installation solaire.',
 'Chauffage & Sanitaire', false, 9),

('equilibrage-hydraulique',
 'Équilibrage hydraulique',
 'Enregistre une demande pour un équilibrage hydraulique du chauffage.',
 'Chauffage & Sanitaire', false, 10),

('probleme-chauffage',
 'Problème de chauffage',
 'Enregistre la panne ou le problème du chauffage.',
 'Chauffage & Sanitaire', false, 11),

('problemes-pompe-chaleur',
 'Problèmes de pompe à chaleur',
 'Enregistre une demande concernant une pompe à chaleur défectueuse.',
 'Chauffage & Sanitaire', false, 12),

('reparation-sanitaire',
 'Réparation sanitaire',
 'Enregistre une demande de réparation par exemple de baignoire, douche, toilette, eau.',
 'Chauffage & Sanitaire', false, 13),

('urgence-cs-generale',
 'Urgence C&S générale',
 'Enregistre une urgence dans le domaine du chauffage et de la plomberie.',
 'Chauffage & Sanitaire', true, 14),

-- ── Électricité & Solaire (8) ────────────────────────────────────────────────
('demande-nouvel-eclairage',
 'Demande de nouvel éclairage',
 'Enregistre une demande pour un nouveau système d''éclairage.',
 'Électricité & Solaire', false, 1),

('demande-nouvelle-borne-recharge',
 'Demande de nouvelle borne de recharge',
 'Enregistre une demande d''installation d''une borne de recharge.',
 'Électricité & Solaire', false, 2),

('demande-nouvelle-installation-pv',
 'Demande de nouvelle installation PV / photovoltaïque / solaire',
 'Enregistre une demande pour une nouvelle installation PV / photovoltaïque / solaire.',
 'Électricité & Solaire', false, 3),

('demande-smart-home',
 'Demande Smart-Home',
 'Enregistre une demande pour un nouveau système de maison intelligente.',
 'Électricité & Solaire', false, 4),

('e-check-certificat-controle',
 'E-Check ou certificat de contrôle',
 'Enregistre une demande pour un E-Check ou la délivrance d''un certificat de contrôle.',
 'Électricité & Solaire', false, 5),

('panne-courant-fusible',
 'Panne de courant ou fusible défectueux',
 'Enregistre une demande concernant une coupure de courant ou un fusible défectueux.',
 'Électricité & Solaire', true, 6),

('renouvellement-electricite-ancien-batiment',
 'Renouvellement électricité / électricité ancien bâtiment',
 'Enregistre une demande de modernisation d''une installation électrique dans un bâtiment ancien.',
 'Électricité & Solaire', false, 7),

('vde-examen-electrique',
 'VDE examen électrique',
 'Enregistre une demande pour un contrôle VDE d''une installation électrique.',
 'Électricité & Solaire', false, 8),

-- ── Aménagement paysager (8) ─────────────────────────────────────────────────
('demande-entretien-jardin-arbres',
 'Demande d''entretien de jardin et d''arbres',
 'Saisissez une demande pour un entretien de jardin et d''arbres.',
 'Aménagement paysager', false, 1),

('demande-bassin-installation-aquatique',
 'Demande de bassin ou d''installation aquatique',
 'Enregistre une demande pour un nouvel étang ou une nouvelle installation aquatique.',
 'Aménagement paysager', false, 2),

('demande-cloture-brise-vue',
 'Demande de clôture ou de brise-vue',
 'Enregistre une demande pour une nouvelle clôture ou un écran de protection.',
 'Aménagement paysager', false, 3),

('demande-gazon-rouleau',
 'Demande de gazon en rouleau',
 'A enregistré une demande pour la fourniture de gazon en rouleaux.',
 'Aménagement paysager', false, 4),

('demande-nouvelle-terrasse',
 'Demande de nouvelle terrasse',
 'Enregistre une demande pour une nouvelle terrasse ou une terrasse à rénover.',
 'Aménagement paysager', false, 5),

('demande-reamenagement-jardin',
 'Demande de réaménagement du jardin',
 'Enregistre une demande pour une refonte d''un jardin.',
 'Aménagement paysager', false, 6),

('demande-systeme-irrigation',
 'Demande de système d''irrigation',
 'Enregistre une demande pour un système d''irrigation automatique pour le jardin.',
 'Aménagement paysager', false, 7),

('reparer-surface-pave',
 'Réparer la surface du pavé',
 'Enregistre une demande de réparation des dommages sur les surfaces pavées.',
 'Aménagement paysager', false, 8),

-- ── Menuiserie (8) ───────────────────────────────────────────────────────────
('demande-nouvel-escalier',
 'Demande d''un nouvel escalier',
 'Enregistre une demande pour la construction neuve ou la rénovation d''un escalier.',
 'Menuiserie', false, 1),

('demande-comptoir-construction-magasin',
 'Demande de comptoir ou de construction de magasin',
 'Enregistre une demande pour un comptoir sur mesure ou une construction de magasin.',
 'Menuiserie', false, 2),

('demande-cuisine-equipee',
 'Demande de cuisine équipée',
 'Enregistre une demande pour une nouvelle cuisine intégrée.',
 'Menuiserie', false, 3),

('demande-fabrication-porte-entree',
 'Demande de fabrication de porte d''entrée',
 'Enregistre une demande pour une porte d''entrée sur mesure.',
 'Menuiserie', false, 4),

('demande-meubles-enfants',
 'Demande de meubles pour enfants',
 'Enregistre une demande pour la fabrication de meubles pour enfants sur mesure.',
 'Menuiserie', false, 5),

('demande-nouveaux-placards-etageres',
 'Demande de nouveaux placards ou étagères',
 'Enregistre une demande pour des armoires ou des étagères sur mesure.',
 'Menuiserie', false, 6),

('demande-nouvelles-fenetres-portes',
 'Demande de nouvelles fenêtres ou portes',
 'Enregistre une demande de renouvellement de fenêtres ou de portes.',
 'Menuiserie', false, 7),

('demande-reamenagement-interieur',
 'Demande de réaménagement intérieur',
 'Enregistre une demande pour un aménagement intérieur personnalisé.',
 'Menuiserie', false, 8),

-- ── Peinture (5) ─────────────────────────────────────────────────────────────
('decoration-murale-decorative',
 'Décoration murale décorative',
 'Enregistre une demande pour une décoration murale individuelle, par exemple avec une technique de plâtrage.',
 'Peinture', false, 1),

('elimination-moisissures',
 'Élimination des moisissures',
 'Enregistre une demande pour l''élimination d''une infestation de moisissure sur un mur ou un plafond.',
 'Peinture', false, 2),

('peinture-facade-renovation',
 'Peinture de façade ou rénovation de façade',
 'Saisissez une demande pour un revêtement ou une rénovation de façade.',
 'Peinture', false, 3),

('demande-travaux-peinture',
 'Demande de travaux de peinture',
 'Enregistre une demande pour des travaux de peinture sur par exemple des portes, des fenêtres ou des radiateurs.',
 'Peinture', false, 4),

('travaux-peinture-interieurs',
 'Travaux de peinture ou peinture des intérieurs',
 'Enregistre une demande pour des travaux de peinture ou de peinture intérieure.',
 'Peinture', false, 5),

-- ── Service de désinsectisation (16) ─────────────────────────────────────────
('blattes-ou-cafards',
 'Blattes ou cafards',
 'Prend des informations sur une infestation de cafards et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 1),

('coleopteres',
 'Coléoptères',
 'Prend des informations sur une infestation de coléoptères en boule et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 2),

('desinfectation-apres-deces',
 'Désinfectation après décès',
 'Prend des informations sur une scène de crime / découverte de corps et des coordonnées. Transmet directement si nécessaire.',
 'Service de désinsectisation', true, 3),

('fourmis',
 'Fourmis',
 'Prend des informations sur un problème avec des fourmis ou une infestation de fourmis et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 4),

('frelons-ou-guepes',
 'Frelons ou guêpes',
 'Prend des informations sur une infestation de guêpes / de frelons et des coordonnées.',
 'Service de désinsectisation', true, 5),

('infestation-nuisibles',
 'Infestation de nuisibles (non spécifique)',
 'Prend des informations sur une infestation de nuisibles générale ou inconnue. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 6),

('lepisme-papier',
 'Lépisme du papier',
 'Prend des informations sur une infestation de lépisme du papier et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 7),

('lutte-contre-pigeons',
 'Lutte contre les pigeons',
 'Prend des informations sur une défense contre les pigeons et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 8),

('martre',
 'Martre',
 'Prend des informations sur une infestation de martres et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 9),

('nettoyage-batiments-desencombrement',
 'Nettoyage de bâtiments et désencombrement',
 'Prend des informations sur l''objet à désencombrer.',
 'Service de désinsectisation', false, 10),

('papillons-de-nuit',
 'Papillons de nuit',
 'Prend des informations sur une infestation de mites et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 11),

('poissons-argent',
 'Poissons d''argent',
 'Prend des informations sur une infestation de poissons d''argent et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 12),

('protection-bois-charpente',
 'Protection du bois et de la charpente',
 'Prend des informations sur l''objet infesté par des champignons ou des insectes.',
 'Service de désinsectisation', false, 13),

('puces',
 'Puces',
 'Prend des informations sur une infestation de puces et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 14),

('punaises-de-lit',
 'Punaises de lit',
 'Prend des informations sur une infestation de punaises de lit et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', true, 15),

('souris-ou-rats',
 'Souris ou rats',
 'Prend des informations sur une infestation de souris / rats et des coordonnées. Transfert possible si nécessaire.',
 'Service de désinsectisation', false, 16),

-- ── Service bâtiment (7) ─────────────────────────────────────────────────────
('acces-salle-technique',
 'Accès à la salle technique',
 'Accès à la salle technique pour une connexion Internet ou pour lire le compteur électrique.',
 'Service bâtiment', false, 1),

('nouvelle-demande-service',
 'Nouvelle demande de service',
 'Nouvelle demande concernant l''un des services proposés par le prestataire. Il peut s''agir d''un projet tel qu''un débarras ou d''un service comme l''entretien de jardin, le nettoyage de la maison ou le service d''hiver.',
 'Service bâtiment', false, 2),

('releve-compteur-electrique',
 'Relevé du compteur électrique',
 'Enregistrer l''état actuel d''un compteur électrique.',
 'Service bâtiment', false, 3),

('remise-appartement',
 'Remise de l''appartement',
 'Fixer la date d''une remise de clé d''appartement.',
 'Service bâtiment', false, 4),

('remise-cles-etat-lieux-sortie',
 'Remise des clés / état des lieux de sortie',
 'Fixer la date de la remise des clés de l''appartement, la remise finale de l''appartement.',
 'Service bâtiment', false, 5),

('signalement-probleme-general',
 'Signalement d''un problème général',
 'L''appelant appelle en raison d''un problème qui n''est pas traité par un autre motif d''appel. C''est pourquoi on demande ici une brève description du problème.',
 'Service bâtiment', false, 6),

('urgence-generale',
 'Urgence',
 'L''appelant appelle en raison d''une urgence dans son appartement ou dans le bâtiment où il vit.',
 'Service bâtiment', true, 7),

-- ── Général / Service client (3) ─────────────────────────────────────────────
('demande-rappel',
 'Demande de rappel',
 'L''appelant souhaite un rappel sans mentionner de demande spécifique.',
 'Général / Service client', false, 1),

('reclamation-qualite',
 'Réclamation concernant la qualité',
 'Insatisfaction concernant les services rendus, ou désaccord avec le montant de la facture.',
 'Général / Service client', false, 2),

('transfert-sur-demande',
 'Transfert sur demande',
 'Effectue l''appel à la demande de l''appelant.',
 'Général / Service client', false, 3);
