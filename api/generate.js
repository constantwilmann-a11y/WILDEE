// WILDEE - version 1
// 3 brouillons générés avec des "styles" différents, puis une étape d'arbitrage
// qui garde le meilleur de chacun. La clé reste secrète côté serveur.

const MODEL = "gemini-3.5-flash"; // si ce modèle pose problème : "gemini-3.1-flash-lite"
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function demander(prompt, temperature) {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Erreur côté Gemini");
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "La clé GEMINI_API_KEY est absente dans Vercel" });
  }

  const produit = ((req.body || {}).produit || "").trim();
  if (produit.length < 3) {
    return res.status(400).json({ error: "Description du produit manquante" });
  }

  const consigne = `Tu es un expert francophone en e-commerce et en marketing digital.
Produit à vendre : ${produit}

Rédige en français, de façon concrète et sans blabla :
1. FICHE PRODUIT : un titre accrocheur, une description courte, 5 bénéfices clients.
2. 3 ANGLES PUBLICITAIRES : pour chacun, le public visé, le problème que le produit résout et l'idée centrale.
3. TEXTES DE PUB : pour chaque angle, un texte court prêt à publier sur Facebook ou Instagram et un titre de pub.
N'invente aucune caractéristique technique absente de la description.`;

  try {
    // Étape 1 : trois brouillons avec des niveaux de créativité différents
    const brouillons = await Promise.all([0.4, 0.8, 1.1].map((t) => demander(consigne, t)));

    // Étape 2 : l'arbitre compare et fabrique la meilleure version
    const arbitrage = `Tu es directeur marketing. Voici 3 propositions pour vendre ce produit : ${produit}

--- PROPOSITION A ---
${brouillons[0]}

--- PROPOSITION B ---
${brouillons[1]}

--- PROPOSITION C ---
${brouillons[2]}

Mission : compare ces propositions, garde le meilleur de chacune et écris la version finale.
Garde exactement la même structure (FICHE PRODUIT, 3 ANGLES PUBLICITAIRES, TEXTES DE PUB).
Retire tout ce qui est exagéré ou non vérifiable. Termine par une ligne "Pourquoi ces choix :" en 2 phrases maximum.`;

    const resultat = await demander(arbitrage, 0.3);
    return res.status(200).json({ resultat });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
