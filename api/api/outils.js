// WILDEE - outils : variantes A/B de pubs et messages WhatsApp.

const MODELES = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
const adresse = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const PLATEFORMES = {
  "Facebook / Instagram": "un texte de 3 à 5 lignes",
  "TikTok": "une légende courte et orale",
  "Google Ads": "un titre de 30 caractères maximum et une description de 90 caractères maximum"
};

const TYPES_WA = {
  "Première réponse à un client intéressé": "répondre à un client qui vient de montrer de l'intérêt : l'accueillir, répondre aux questions probables et proposer la suite.",
  "Présenter l'offre et conclure la vente": "présenter l'offre clairement (produit, prix, ce qui est inclus) et demander les informations de livraison pour conclure.",
  "Relance (le client n'a pas répondu)": "relancer poliment un client qui n'a pas répondu, sans pression ni fausse urgence.",
  "Confirmation de commande avant livraison (pour limiter les refus)": "confirmer la commande avant l'expédition : récapitulatif, adresse, créneau, montant à préparer, et demander une confirmation claire pour limiter les colis refusés.",
  "Message avant le passage du livreur": "prévenir le client que le livreur va passer, rappeler le montant à payer et lui demander d'être joignable.",
  "Demande d'avis après livraison": "remercier le client après la livraison et lui demander un avis honnête."
};

async function demander(prompt, temperature) {
  let derniereErreur = "Erreur côté Gemini";
  for (const modele of MODELES) {
    const r = await fetch(adresse(modele), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature } })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    derniereErreur = data?.error?.message || "Erreur côté Gemini";
    if ([404, 429, 500, 503].includes(r.status)) { await pause(800); continue; }
    throw new Error(derniereErreur);
  }
  throw new Error(derniereErreur);
}

const court = (v, max) => String(v || "").trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  if (process.env.ACCES_CODE && req.headers["x-code"] !== process.env.ACCES_CODE) {
    return res.status(401).json({ error: "Code d'accès requis ou incorrect" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "La clé GEMINI_API_KEY est absente dans Vercel" });
  }

  const c = req.body || {};
  const produit = court(c.produit, 1500);
  const pays = court(c.pays, 60) || "Afrique francophone";
  const devise = court(c.devise, 30);
  const paiement = court(c.paiement, 60);
  const ton = court(c.ton, 40) || "Professionnel";
  if (produit.length < 3) return res.status(400).json({ error: "Description du produit manquante" });

  const regles = `RÈGLES STRICTES
- Utilise uniquement les informations données. N'invente aucun prix, délai, garantie, certification, promotion ou résultat chiffré. Écris entre crochets, par exemple [prix], tout ce qui manque.
- Évite les superlatifs non prouvés ("le meilleur", "100 %", "garanti"), les promesses de santé, les faux avis, la fausse rareté et les faux comptes à rebours.
- Utilise un français simple et courant, adapté au pays visé (${pays}).
- Écris en texte simple, sans Markdown (pas de #, pas de **).`;

  try {
    if (c.mode === "variantes") {
      const angle = [1, 2, 3].includes(Number(c.angle)) ? Number(c.angle) : 1;
      const plateforme = PLATEFORMES[c.plateforme] ? c.plateforme : "Facebook / Instagram";
      const fiche = court(c.fiche, 12000);
      const prompt = `Tu es un expert francophone de la publicité en ligne et des tests A/B.
Produit : ${produit}
Marché visé : ${pays}. Ton : ${ton}. Plateforme : ${plateforme}.
Devise des prix : ${devise || "celle de la description"}. Mode de paiement : ${paiement || "non précisé"}. Le client commande : ${court(c.commande, 60) || "non précisé"}.

Fiche et angles déjà validés :
${fiche || "(non fournie)"}

Mission : écris 5 variantes de publicité pour l'ANGLE ${angle}, chacune avec une approche différente :
1. une question qui interpelle ;
2. problème puis solution ;
3. un bénéfice concret (chiffré uniquement si le chiffre figure dans la description) ;
4. un ton de conversation, comme un message à un ami ;
5. une urgence honnête.
Pour chaque variante, écris les lignes APPROCHE, ACCROCHE, TEXTE (${PLATEFORMES[plateforme]}), TITRE et APPEL À L'ACTION.
Chaque variante commence par une ligne contenant seulement "VARIANTE 1", "VARIANTE 2", etc. Commence directement par "VARIANTE 1", sans introduction.
Si le client commande sur WhatsApp, l'appel à l'action invite à écrire sur WhatsApp, sans inventer de numéro. Mentionne le paiement à la livraison seulement si le mode de paiement l'indique.

${regles}`;
      return res.status(200).json({ resultat: await demander(prompt, 0.9) });
    }

    if (c.mode === "whatsapp") {
      const type = TYPES_WA[c.type] ? c.type : "Présenter l'offre et conclure la vente";
      const prompt = `Tu écris des messages WhatsApp pour un vendeur en ligne, en français.
Produit : ${produit}
Boutique : ${court(c.boutique, 60) || "non précisée"}. Pays : ${pays}. Devise : ${devise || "non précisée"}. Mode de paiement : ${paiement || "non précisé"}.
Lien de paiement à inclure tel quel, s'il existe : ${court(c.lien, 300) || "aucun"}.
Informations utiles : ${court(c.infos, 600) || "aucune"}.
Ton : ${ton}.

Mission : écris 3 versions différentes d'un message pour ${TYPES_WA[type]}
Format WhatsApp : 3 à 6 lignes courtes, un ton chaleureux et naturel, 1 à 3 emojis au maximum, un seul gras avec une astérisque de chaque côté (*comme ça*) si c'est utile, et une seule question ou demande claire à la fin.
Chaque version commence par une ligne contenant seulement "VERSION 1", "VERSION 2" ou "VERSION 3". Commence directement par "VERSION 1", sans introduction.
Ces messages s'adressent à des personnes qui ont déjà écrit au vendeur ou accepté d'être contactées : n'écris jamais de message de prospection à froid.

${regles.replace("sans Markdown (pas de #, pas de **)", "sans Markdown, sauf le gras WhatsApp avec une astérisque")}`;
      return res.status(200).json({ resultat: await demander(prompt, 0.8) });
    }

    return res.status(400).json({ error: "Mode inconnu" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
