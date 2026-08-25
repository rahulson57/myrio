/**
 * Seed Data's user roster (SPEC-003 volumes: "12: 10 authors + 2
 * reader-only") and the article→author manifest tying each corpus file
 * (`corpus/*.json`, keyed by `title` — pure `CorpusFile`s, carrying no
 * seed-account info of their own) to the seeded blog account that
 * "publishes" it and to its draft/published status.
 */

export interface SeedUserSpec {
  handle: string;
  displayName: string;
  bio: string;
  role: 'author' | 'reader';
}

export const SEED_USERS: SeedUserSpec[] = [
  { handle: 'elena-marsh', displayName: 'Elena Marsh', bio: 'Keeper of small lights and long journals.', role: 'author' },
  { handle: 'cormac-reyes', displayName: 'Cormac Reyes', bio: 'Writes mostly on trains, to people mostly far away.', role: 'author' },
  { handle: 'priya-nandan', displayName: 'Priya Nandan', bio: 'Collects fables the way other people collect stamps.', role: 'author' },
  { handle: 'declan-oshea', displayName: "Declan O'Shea", bio: 'Cartography, inherited and otherwise.', role: 'author' },
  { handle: 'amara-osei', displayName: 'Amara Osei', bio: 'Chronicler of the old quarter after dark.', role: 'author' },
  { handle: 'felix-tran', displayName: 'Felix Tran', bio: 'A season among the reeds, most years.', role: 'author' },
  { handle: 'sofia-lindqvist', displayName: 'Sofia Lindqvist', bio: 'Salt roads, caravans, and the wells between them.', role: 'author' },
  { handle: 'malik-hassan', displayName: 'Malik Hassan', bio: 'Winter coastlines and the small fires against them.', role: 'author' },
  { handle: 'greta-voss', displayName: 'Greta Voss', bio: 'Small gears, studied slowly.', role: 'author' },
  { handle: 'ravi-chandran', displayName: 'Ravi Chandran', bio: 'Wanderings, mostly beyond the fen.', role: 'author' },
  { handle: 'june-alvarez', displayName: 'June Alvarez', bio: 'Reads everything, writes nothing (yet).', role: 'reader' },
  { handle: 'oskar-lindberg', displayName: 'Oskar Lindberg', bio: 'Here for the comments section.', role: 'reader' },
];

export interface ArticleManifestEntry {
  title: string;
  handle: string;
  status: 'draft' | 'published';
}

/** One entry per `corpus/*.json` file, matched by `title` (unique across
 * the corpus). Generated alongside the corpus fixtures; see the reasoning
 * in the TASK-019 proposal for how the corpus itself was produced (no
 * network access in this environment — original seed-fixture prose, not a
 * literal Gutenberg download). */
export const ARTICLE_MANIFEST: ArticleManifestEntry[] = [
  { title: 'The Lamp at Merrow Point', handle: 'elena-marsh', status: 'published' },
  { title: 'Fog Over the Shoals', handle: 'elena-marsh', status: 'published' },
  { title: "The Keeper's Last Watch", handle: 'elena-marsh', status: 'published' },
  { title: 'Letters Never Sent', handle: 'elena-marsh', status: 'draft' },
  { title: 'The Storm Log', handle: 'elena-marsh', status: 'draft' },
  { title: 'The Night Train to Esting', handle: 'cormac-reyes', status: 'published' },
  { title: 'A Platform in the Rain', handle: 'cormac-reyes', status: 'published' },
  { title: 'Correspondence from Mile 214', handle: 'cormac-reyes', status: 'published' },
  { title: "The Clockmaker's Riddle", handle: 'priya-nandan', status: 'published' },
  { title: 'A Parable of Two Rivers', handle: 'priya-nandan', status: 'published' },
  { title: 'The Hour Between Dog and Wolf', handle: 'priya-nandan', status: 'published' },
  { title: 'The Unfinished Map', handle: 'declan-oshea', status: 'published' },
  { title: 'Survey of the Eastern Ridge', handle: 'declan-oshea', status: 'published' },
  { title: 'Where the Rivers Are Not Drawn', handle: 'declan-oshea', status: 'published' },
  { title: 'The Instrument Case', handle: 'declan-oshea', status: 'draft' },
  { title: 'Notes Toward a New Coastline', handle: 'declan-oshea', status: 'draft' },
  { title: "The Lamplighter's Round", handle: 'amara-osei', status: 'published' },
  { title: 'A House on Vellum Street', handle: 'amara-osei', status: 'published' },
  { title: 'What the Night Porter Saw', handle: 'amara-osei', status: 'published' },
  { title: 'The Marsh in April', handle: 'felix-tran', status: 'published' },
  { title: 'Nesting Season', handle: 'felix-tran', status: 'published' },
  { title: "The Reed-Cutter's Daughter", handle: 'felix-tran', status: 'published' },
  { title: 'Crossing the Salt Flats', handle: 'sofia-lindqvist', status: 'published' },
  { title: 'The Caravan at Dusk', handle: 'sofia-lindqvist', status: 'published' },
  { title: 'A Well Half-Remembered', handle: 'sofia-lindqvist', status: 'published' },
  { title: "The Merchant's Ledger", handle: 'sofia-lindqvist', status: 'draft' },
  { title: 'Rumors from the Last Oasis', handle: 'sofia-lindqvist', status: 'draft' },
  { title: 'The Tide in December', handle: 'malik-hassan', status: 'published' },
  { title: 'A Small Fire Against the Dark', handle: 'malik-hassan', status: 'published' },
  { title: 'On Walking Alone in Snow', handle: 'malik-hassan', status: 'published' },
  { title: 'The First Movement', handle: 'greta-voss', status: 'published' },
  { title: 'A Study in Small Gears', handle: 'greta-voss', status: 'published' },
  { title: 'Beyond the Willow Line', handle: 'ravi-chandran', status: 'published' },
  { title: 'The Last Ferry Crossing', handle: 'ravi-chandran', status: 'published' },
];
