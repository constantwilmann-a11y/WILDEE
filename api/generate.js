// WILDEE - version 2
// 3 brouillons avec des niveaux de créativité différents, puis un arbitrage qui garde le meilleur.
// Si un modèle est surchargé, on passe automatiquement au suivant.

const MODELES = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
const adresse = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const TONS = {
  "Professionnel": "professionnel, clair et rassurant",
  "Décontracté": "décontracté et proche du client, avec tutoiement",
  "Premium": "haut de gamme, élégant et sobre",
  "Humoristique": "léger et drôle, sans en faire trop"
};

const PLATEFORMES = {
  "Facebook / Instagram": "3 accroches de première ligne (courtes, qui donnent envie de lire la suite), puis un texte de 3 à 5 lignes, un titre de pub et un appel à l'action.",
  "TikTok": "3 accroches orales pour les 3 premières secondes de la vidéo, puis une légende courte et un appel à l'action.",
  "Google Ads": "3 titres de 30 caractères maximum chacun et 2 descriptions de 90 caractères maximum chacune."
};

async function demander(prompt, temperature) {
  let derniereErreur = "Erreur côté Gemini";
  for (const modele of MODELES) {
    const r = await fetch(adresse(modele), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    }
    derniereErreur = data?.error?.message || "Erreur côté Gemini";
    if ([404, 429, 500, 503].includes(r.status)) { await pause(800); continue; }
    throw new Error(derniereErreur);
  }
  throw new Error(derniereErreur);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  if (process.env.ACCES_CODE && req.headers["x-code"] !== process.env.ACCES_CODE) {
    return res.status(401).json({ error: "Code d'accès requis ou incorrect" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "La clé GEMINI_API_KEY est absente dans Vercel" });
  }

  const corps = req.body || {};
  const produit = String(corps.produit || "").trim().slice(0, 1500);
  const pays = String(corps.pays || "").trim().slice(0, 60) || "Afrique francophone";
  const devise = String(corps.devise || "").trim().slice(0, 30);
  const paiement = String(corps.paiement || "").trim().slice(0, 60);
  const commande = String(corps.commande || "").trim().slice(0, 60);
  const nomTon = TONS[corps.ton] ? corps.ton : "Professionnel";
  const nomPlateforme = PLATEFORMES[corps.plateforme] ? corps.plateforme : "Facebook / Instagram";
  if (produit.length < 3) return res.status(400).json({ error: "Description du produit manquante" });

  const consigne = `Tu es un expert francophone en e-commerce et en publicité en ligne.
Produit : ${produit}
Marché visé : ${pays}. Ton à adopter : ${TONS[nomTon]}.
Plateforme publicitaire : ${nomPlateforme}.
Devise des prix : ${devise || "celle de la description"}. Mode de paiement : ${paiement || "non précisé"}. Le client commande : ${commande || "non précisé"}.

RÈGLES STRICTES
- Utilise uniquement les informations données dans la description du produit.
- N'invente aucune caractéristique, garantie, certification, promotion, délai de livraison ou résultat chiffré.
- Évite les superlatifs non prouvés ("le meilleur", "100 %", "garanti", "révolutionnaire") et toute promesse de santé.
- Écris les prix avec la devise indiquée (par exemple 15 000 FCFA), sans les convertir.
- Évoque le paiement à la livraison seulement si le mode de paiement l'indique, et invite à commander sur WhatsApp seulement si c'est le canal indiqué (sans inventer de numéro).
- Utilise un français simple et courant, adapté au pays visé.
- Écris en texte simple : pas de Markdown (pas de #, pas de **). Les titres de section sont en MAJUSCULES.
- Commence directement par "FICHE PRODUIT", sans phrase d'introduction.

STRUCTURE À RESPECTER
FICHE PRODUIT : un titre accrocheur, une description courte (3 phrases maximum), 5 bénéfices clients.
3 ANGLES PUBLICITAIRES : pour chaque angle, le public visé, le problème résolu et l'idée centrale.
TEXTES DE PUB : pour chaque angle (même numérotation), ${PLATEFORMES[nomPlateforme]}
À VÉRIFIER AVEC TON FOURNISSEUR : la liste des informations importantes absentes de la description (matière exacte, dimensions, délai de livraison, retours, garantie, certifications...) à confirmer avant de les promettre dans une pub.`;

  try {
    const brouillons = await Promise.all([0.4, 0.8, 1.1].map((t) => demander(consigne, t)));

    const arbitrage = `Tu es directeur marketing. Voici 3 propositions pour vendre ce produit : ${produit}

--- PROPOSITION A ---
${brouillons[0]}

--- PROPOSITION B ---
${brouillons[1]}

--- PROPOSITION C ---
${brouillons[2]}

Mission : compare ces propositions, garde le meilleur de chacune (les accroches les plus fortes en priorité) et écris la version finale.
Vérifie que chaque affirmation figure bien dans la description du produit et supprime les autres.
Garde exactement la même structure (FICHE PRODUIT, 3 ANGLES PUBLICITAIRES, TEXTES DE PUB, À VÉRIFIER AVEC TON FOURNISSEUR).
Écris en texte simple, sans Markdown, et commence directement par "FICHE PRODUIT".
Termine par "POURQUOI CES CHOIX" en 2 phrases maximum, factuelles (ce que tu as retenu et supprimé), sans formule publicitaire ni auto-félicitation.`;

    const resultat = await demander(arbitrage, 0.3);
    return res.status(200).json({ resultat });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
