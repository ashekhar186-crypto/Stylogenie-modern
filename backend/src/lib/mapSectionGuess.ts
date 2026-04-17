// mapSectionGuess.ts — maps a garment type / category string → Prisma Section enum.
// Covers 100+ garment types including Indian ethnic wear, Western, and activewear.

export type PrismaSection =
  | "Tops"
  | "Bottoms"
  | "Dresses"
  | "Outerwear"
  | "Footwear"
  | "Accessories"
  | "Ethnicwear"
  | "Sportswear";

const SECTION_MAP: Array<{ section: PrismaSection; pattern: RegExp }> = [
  // ── ETHNICWEAR (must come before "Tops" so "kurta" doesn't fall into Tops) ──
  {
    section: "Ethnicwear",
    pattern:
      /saree|sari|lehenga|ghagra|chaniya|choli|salwar|churidar|kameez|anarkali|sharara|gharara|palazzo suit|ethnic suit|sherwani|kurta|kurti|nehru jacket|dhoti|bandhgala|indo western|fusion ethnic|ethnic|traditional indian|dupatta/i,
  },

  // ── SPORTSWEAR ──
  {
    section: "Sportswear",
    pattern:
      /sports bra|gym|activewear|track(suit| pant| jacket)?|jogger|yoga pant|workout|athletic|jersey|cycling short|compression|legging.*sport|sports short|training/i,
  },

  // ── OUTERWEAR ──
  {
    section: "Outerwear",
    pattern:
      /\bblazer\b|jacket|overcoat|\bcoat\b|trench|windbreaker|bomber|puffer|parka|raincoat|hoodie|sweatshirt|cardigan|knitwear|sweater|pullover|fleece|shrug|cape|poncho|vest.*outer|gilet/i,
  },

  // ── DRESSES / CO-ORDS ──
  {
    section: "Dresses",
    pattern:
      /\bdress\b|gown|romper|jumpsuit|playsuit|dungaree|co.?ord|coordinate set|two.?piece.*dress|maxi skirt.*top|bodysuit.*skirt/i,
  },

  // ── BOTTOMS ──
  {
    section: "Bottoms",
    pattern:
      /\bjean\b|denim|trouser|chino|\bpant\b|\bshort\b|\bskirt\b|mini skirt|midi skirt|maxi skirt|palazzo|culottes|cargo|jogger.*pant|legging|tights|flare pant|wide.?leg|straight.?leg|slim.?leg|capri|cropped pant|bermuda|sweatpant|track pant/i,
  },

  // ── FOOTWEAR ──
  {
    section: "Footwear",
    pattern:
      /shoe|sneaker|boot|ankle boot|knee.?high|heel|stiletto|block heel|kitten heel|loafer|oxford|derby|monk strap|sandal|flip flop|slide|mule|wedge|platform|slipper|flat|ballerina|espadrille|kolhapuri|jutti|mojari|chappal|clog/i,
  },

  // ── ACCESSORIES ──
  {
    section: "Accessories",
    pattern:
      /bag|handbag|clutch|purse|tote|satchel|crossbody|backpack|shoulder bag|wallet|belt|watch|sunglasses|eyewear|hat|cap|beanie|beret|scarf|stole|shawl|glove|jewel|necklace|earring|bracelet|ring|bangle|anklet|brooch|hair.*access|headband|hair clip|dupatta|maang tikka|kamarband|nose ring|nath/i,
  },

  // ── TOPS (last so ethnic/sport/outerwear patterns take priority) ──
  {
    section: "Tops",
    pattern:
      /\btop\b|t.?shirt|tee\b|blouse|crop top|tube top|halter|tank top|camisole|bustier|corset top|off.?shoulder|one.?shoulder|peplum|polo|henley|button.?down|button.?up|oxford shirt|flannel|linen shirt|kaftan.*top|shirt/i,
  },
];

export function mapSectionGuess(input?: string): PrismaSection | undefined {
  if (!input) return undefined;
  const text = input.trim().toLowerCase();

  for (const { section, pattern } of SECTION_MAP) {
    if (pattern.test(text)) return section;
  }
  return undefined;
}

// ─── Garment sub-type normaliser ─────────────────────────────────────────────
// Standardises the AI's free-text garment type into a canonical sub-type label.
// Used to enrich the deepSummary and styleTag context for recommendation engine.

const SUBTYPE_MAP: Array<{ subType: string; pattern: RegExp }> = [
  // Ethnic
  { subType: "Saree",         pattern: /saree|sari/i },
  { subType: "Lehenga",       pattern: /lehenga|ghagra|chaniya/i },
  { subType: "Salwar Suit",   pattern: /salwar|churidar|kameez|sharara|gharara/i },
  { subType: "Anarkali",      pattern: /anarkali/i },
  { subType: "Kurta",         pattern: /\bkurta\b/i },
  { subType: "Kurti",         pattern: /\bkurti\b/i },
  { subType: "Sherwani",      pattern: /sherwani|bandhgala/i },
  // Western bottoms
  { subType: "Jeans",         pattern: /jean|denim.*pant/i },
  { subType: "Trousers",      pattern: /trouser|chino|formal pant/i },
  { subType: "Shorts",        pattern: /\bshort\b/i },
  { subType: "Mini Skirt",    pattern: /mini skirt/i },
  { subType: "Midi Skirt",    pattern: /midi skirt/i },
  { subType: "Maxi Skirt",    pattern: /maxi skirt/i },
  { subType: "Leggings",      pattern: /legging|tight/i },
  { subType: "Palazzo Pants", pattern: /palazzo/i },
  // Western tops
  { subType: "T-Shirt",       pattern: /t.?shirt|tee\b/i },
  { subType: "Blouse",        pattern: /\bblouse\b/i },
  { subType: "Crop Top",      pattern: /crop top/i },
  { subType: "Shirt",         pattern: /\bshirt\b/i },
  { subType: "Tank Top",      pattern: /tank top|camisole|sleeveless top/i },
  // Dresses
  { subType: "Mini Dress",    pattern: /mini dress/i },
  { subType: "Midi Dress",    pattern: /midi dress/i },
  { subType: "Maxi Dress",    pattern: /maxi dress/i },
  { subType: "Jumpsuit",      pattern: /jumpsuit|romper|playsuit/i },
  { subType: "Co-ord Set",    pattern: /co.?ord|coordinate set/i },
  // Outerwear
  { subType: "Blazer",        pattern: /\bblazer\b/i },
  { subType: "Jacket",        pattern: /jacket/i },
  { subType: "Coat",          pattern: /\bcoat\b|overcoat|trench/i },
  { subType: "Hoodie",        pattern: /hoodie|sweatshirt/i },
  { subType: "Sweater",       pattern: /sweater|cardigan|pullover/i },
];

export function detectSubType(input?: string): string | undefined {
  if (!input) return undefined;
  for (const { subType, pattern } of SUBTYPE_MAP) {
    if (pattern.test(input)) return subType;
  }
  return undefined;
}
