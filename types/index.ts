// User-related types
export interface UserType {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AuthContextType {
  user: UserType | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

// Search-related types
export interface SearchResult {
  id: string;
  score: number;
  chapter: number;
  verse: number;
  text: string;
  author: string;
  chapter_name?: string;
  book_id?: string;
  title?: string;
  volume?: number;
  source?: 'keyword' | 'semantic' | 'both';
  // Tanzil Arabic text & metadata (Phase 1)
  text_arabic_uthmani?: string;   // Uthmani script for display
  surah_name?: string;            // Transliterated name (e.g., "Al-Baqara")
  surah_name_arabic?: string;     // Arabic name (e.g., "البقرة")
  surah_name_english?: string;    // English name (e.g., "The Cow")
  revelation_type?: 'Meccan' | 'Medinan';
  juz?: number;                   // 1-30
  hizb?: number;                  // Hizb quarter index
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

// URL-based search state (Phase 3)
export interface SearchParams {
  q: string;
  page: number;
  titles: string[];       // book filters (e.g., ['quran', 'bukhari'])
  mode: string;           // search mode (text | semantic | hybrid)
}

// Component props
export interface SearchFormProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

export interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Props for our new StoriesList component
export interface StoriesListProps {
  source?: string; // To track where the click came from
}

// Bookmark-related types
export interface BookmarkMetadata {
  notesHtml: string; // Rich text HTML from Quill
  tags: string[];
  priority: number;
}

export interface Bookmark extends SearchResult {
  verseId: string;
  notesHtml: string; // Rich text HTML from Quill
  tags: string[];
  priority: number;
  editCount: number; // Track number of edits
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface UseBookmarksReturn {
  bookmarks: Bookmark[];
  bookmarkedVerses: Set<string>;
  isBookmarked: (verseId: string) => boolean;
  addBookmark: (result: SearchResult, metadata?: Partial<BookmarkMetadata>) => Promise<void>;
  removeBookmark: (verseId: string) => Promise<void>;
  updateBookmarkMetadata: (verseId: string, metadata: Partial<BookmarkMetadata>) => Promise<void>;
  updateBookmarkNotes: (verseId: string, notesHtml: string) => Promise<void>;
  loading: boolean;
}
