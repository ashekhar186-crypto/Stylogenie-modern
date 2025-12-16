export function mapSectionGuess(
  typeOrCategory?: string
):
  | "Tops"
  | "Bottoms"
  | "Dresses"
  | "Outerwear"
  | "Footwear"
  | "Accessories"
  | "Ethnicwear"
  | "Sportswear"
  | undefined {
  if (!typeOrCategory) return;
  const s = typeOrCategory.toLowerCase();
  if (/(shirt|t[- ]?shirt|tee|blouse|top)/.test(s)) return "Tops";
  if (/(jean|pant|trouser|chino|short)/.test(s)) return "Bottoms";
  if (/dress/.test(s)) return "Dresses";
  if (/(jacket|coat|hoodie|sweater|cardigan)/.test(s)) return "Outerwear";
  if (/(shoe|sneaker|boot|heel|loafer|sandal)/.test(s)) return "Footwear";
  if (/(bag|belt|watch|hat|cap|scarf|glove|sunglass|jewel)/.test(s))
    return "Accessories";
  if (/(saree|kurta|lehenga|sherwani|ethnic)/.test(s)) return "Ethnicwear";
  if (/(jersey|sports|gym|active)/.test(s)) return "Sportswear";
  return;
}
