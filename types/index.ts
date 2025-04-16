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
  title?: string; // Added title field
  volume?: number; // Added volume field
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

// Component props
export interface SearchFormProps {
  onSearch: (query: string) => Promise<void>;
  initialQuery?: string;
}

export interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
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
