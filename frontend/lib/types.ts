export type Role = "ADMIN" | "MEMBER";
export type User = { id: string; name: string; email: string; role: Role };

export type Section = "Tops" | "Bottoms" | "Dresses" | "Outerwear" | "Footwear" | "Accessories" | "Ethnicwear" | "Sportswear";
export type Season = "Spring" | "Summer" | "Autumn" | "Winter";
export type Occasion = "Casual" | "Formal" | "Sports" | "Party" | "Ethnic";

export type Item = {
  id: string;
  imageUrl: string;
  title?: string | null;
  brand?: string | null;
  color: string[];
  material?: string | null;
  texture?: string | null;
  pattern?: string | null;
  fit?: string | null;
  silhouette?: string | null;
  styleEra?: string | null;
  careGuess?: string | null;
  deepSummary?: string | null;
  microTrend?: string | null;
  trendiness?: number | null;
  size?: string | null;
  price?: number | null;
  season?: Season | null;
  occasion?: Occasion | null;
  styleTags: string[];
  notes?: string | null;
  section?: Section | null;
  predictedLabels: string[];
  confidences: number[];
  dominantColorHex?: string | null;
  approved: boolean;
  archived: boolean;
  // Feature 6, 7: laundry & wear tracking
  inLaundry: boolean;
  wearCount: number;
  lastWorn?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Feature 1: Outfit feedback
export type OutfitFeedback = {
  id: string;
  outfitHash: string;
  reaction: "like" | "dislike" | "save";
  outfitType?: string | null;
  occasion?: string | null;
  itemIds: string[];
  createdAt: string;
};

// Feature 5: Outfit calendar
export type OutfitCalendarEntry = {
  id: string;
  date: string;
  outfitLabel?: string | null;
  itemIds: string[];
  outfitType?: string | null;
  occasion?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  items?: { id: string; imageUrl: string; title?: string | null; section?: string | null; dominantColorHex?: string | null }[];
  createdAt: string;
  updatedAt: string;
};

// Feature 15: Wardrobe stats
export type WardrobeStats = {
  total: number;
  totalValue: number;
  neverWorn: number;
  inLaundry: number;
  avgTrendiness: number | null;
  bySection: Record<string, number>;
  bySeason: Record<string, number>;
  byOccasion: Record<string, number>;
  byTrend: Record<string, number>;
  topBrands: [string, number][];
  topColors: { hex: string; count: number }[];
  costPerWear: { id: string; price: number; wearCount: number; cpw: number }[];
  mostWorn: { id: string; wearCount: number }[];
  addedByMonth: Record<string, number>;
  gapAnalysis: { section: string; idealPct: number; actualPct: number; gap: boolean }[];
};

export type DeepClassification = {
  title:            string;
  garmentType?:     string;   // specific type e.g. "anarkali suit", "wide-leg jeans"
  subType?:         string;   // normalised sub-type e.g. "Anarkali", "Jeans"
  imageType?:       string;   // "person-wearing" | "mannequin" | "flat-lay" | "product-photo"
  category:         string;   // Section enum
  colors:           string[];
  dominantColorHex: string;
  material:         string;
  texture:          string;
  pattern:          string;
  fit:              string;
  silhouette:       string;
  styleEra:         string;
  trendTags:        string[];
  occasion:         string;
  season:           string;
  careGuess:        string;
  summary:          string;
  parseError?:      boolean;
  rawText?:         string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BookingLink = {
  name: string;
  url: string;
  icon: string;
  description: string;
};

export type BookingLinks = {
  flights: BookingLink[];
  trains: BookingLink[];
  hotels: BookingLink[];
  localTransport: BookingLink[];
};

export type DailyOutfit = {
  day: number;
  type: string;
  outfit: string;
  tip: string;
  wardrobeItemsUsed?: string[];
  newItemsNeeded?: string[];
};

export type PackingList = {
  tops: string[];
  bottoms: string[];
  dresses: string[];
  outerwear: string[];
  footwear: string[];
  accessories: string[];
  essentials: string[];
};

export type WardrobeMatch = {
  wardrobeCode: string;
  wardrobeItemId?: string | null;
  itemTitle: string;
  packReason: string;
  usageDays: string[];
  stylingTip: string;
};

export type ShoppingListItem = {
  itemName: string;
  category: string;
  priority: "essential" | "recommended" | "optional";
  reason: string;
  preferredColor: string;
  styleSpec: string;
  weatherReason?: string | null;
};

export type UserStyleProfile = {
  dominantColors: string[];
  accentColors: string[];
  preferredStyleEras: string[];
  preferredFits: string[];
  preferredOccasions: string[];
  preferredMaterials: string[];
  preferredSections: string[];
  totalItems: number;
  description: string;
};

export type TripStyleProfile = {
  dominantColors: string[];
  description: string;
  tripColorPalette: string[];
  tripColorReason: string;
};

export type TripPlan = {
  weatherSummary: string;
  temperatureRange: string;
  destinationVibe: string;
  styleProfile?: TripStyleProfile;
  wardrobeMatches: WardrobeMatch[];
  shoppingList: ShoppingListItem[];
  packingList: PackingList;
  dailyOutfits: DailyOutfit[];
  colorPalette?: string[];
  trendInsights: string;
  styleNotes: string;
  avoidItems: string[];
  totalOutfits: number;
  packingTip: string;
  bookingLinks?: BookingLinks;
};

export type AdminStats = {
  totalUsers: number;
  totalItems: number;
  pendingItems: number;
  archivedItems: number;
  approvedItems: number;
  itemsBySection: { section: string; count: number }[];
};

export type DestinationBudget = {
  tier: "backpacker" | "average" | "luxury";
  dailyCost: string;
  totalEstimate: string;
  accommodation: string;
  food: string;
  transport: string;
  activities: string;
  currency: string;
  tips: string;
};

export type DestinationWeather = {
  temperature: string;
  humidity: string;
  rainfall: string;
  uvIndex: string;
  bestMonths: string[];
  currentSeason: string;
  clothing: string;
};

export type DestinationAttraction = {
  name: string;
  type: string;
  description: string;
  mustSee: boolean;
};

export type DiscoverDestination = {
  name: string;
  country: string;
  region: string;
  tagline: string;
  matchScore: number;
  matchReasons: string[];
  imageUrl: string;
  wikiDescription: string;
  weather: DestinationWeather;
  budgets: DestinationBudget[];
  attractions: DestinationAttraction[];
  visaInfo: string;
  safetyRating: number;
  safetyNotes: string;
  fashionAdvice: string;
  culturalDressCodes: string;
  sustainabilityTips: string;
  languages: string[];
  bestFor: string[];
  landscape: string;
};

export type DiscoverResponse = {
  destinations: DiscoverDestination[];
  analysisNote: string;
  vibeKeywords: string[];
};
