// WILDEE - script vidéo publicitaire à partir de la fiche et des angles déjà générés.

const MODELES = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
const adresse = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "La clé GEMINI_API_KEY est absente dans Vercel" });
  }

  const corps = req.body || {};
  const produit = String(corps.produit || "").trim().slice(0, 1500);
  const fiche = String(corps.fiche || "").trim().slice(0, 12000);
  const angle = [1, 2, 3].includes(Number(corps.angle)) ? Number(corps.angle) : 1;
  const duree = [15, 30].includes(Number(corps.duree)) ? Number(corps.duree) : 15;
  const ton = String(corps.ton || "Professionnel").slice(0, 40);
  const plateforme = String(corps.plateforme || "Facebook / Instagram").slice(0, 40);
  if (produit.length < 3 || fiche.length < 20) {
    return res.status(400).json({ error: "Génère d'abord la fiche produit et les pubs" });
  }

  const nb = duree === 30 ? 6 : 4;
  const prompt = `Tu es réalisateur de publicités vidéo courtes pour l'e-commerce, en français.
Produit : ${produit}

Voici la fiche et les angles déjà validés :
${fiche}

Écris le script d'une vidéo publicitaire de ${duree} secondes, au format vertical 9:16, pour ${plateforme}, basée sur l'ANGLE ${angle}. Ton : ${ton}.

RÈGLES STRICTES
- Utilise uniquement les informations de la description du produit. N'invente aucune caractéristique, garantie ou résultat chiffré.
- Écris en texte simple : pas de Markdown (pas de #, pas de **). Les titres de section sont en MAJUSCULES.
- Commence directement par "ACCROCHE", sans phrase d'introduction.
- La vidéo doit être compréhensible sans le son (texte à l'écran obligatoire).

STRUCTURE À RESPECTER
ACCROCHE (0 à 3 secondes) : ce qu'on voit et ce qu'on dit pour arrêter le scroll. L'accroche est la scène 1 : ne la répète pas dans les scènes suivantes.
SCÈNES : pour chaque scène suivante, son numéro, sa durée, ce qu'on filme ou montre, le texte affiché à l'écran et la voix off. La voix off ne répète jamais mot pour mot le texte à l'écran : elle apporte une information en plus. Le total doit faire ${duree} secondes.
FIN : appel à l'action et texte final à l'écran.
AMBIANCE : style de musique et rythme du montage.
VISUELS À PRÉPARER : la liste des photos et des plans courts à rassembler, et ceux à demander au fournisseur.
TEXTES_ECRAN : écris exactement cette ligne, puis exactement ${nb} lignes en dessous, une par photo, dans l'ordre de la vidéo. Chaque ligne contient uniquement le texte court (8 mots maximum) à afficher sur cette photo ; la dernière ligne est l'appel à l'action.`;

  try {
    const brut = await demander(prompt, 0.7);
    const coupe = brut.indexOf("TEXTES_ECRAN");
    const resultat = (coupe >= 0 ? brut.slice(0, coupe) : brut).trim();
    const textes = coupe >= 0
      ? brut.slice(coupe + 12).split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 8)
      : [];
    return res.status(200).json({ resultat, textes });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
