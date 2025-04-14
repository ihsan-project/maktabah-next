/**
 * Configuration for story pages
 * This file contains the allowlist of stories that can be accessed via the /story/[name] route
 * To add a new story, add its name to the ALLOWED_STORIES array
 * The corresponding XML file should be placed in the public/stories/ directory with the name [name].xml
 */

// Allowlist of story names that can be accessed
export const ALLOWED_STORIES = [
  'abraham',  // Story about Abraham/Ibrahim
  'moses',    // Story about Moses/Musa
  'jesus',    // Story about Jesus/Isa
  'muhammad', // Story about Muhammad
  // Add more stories here as XML files are created
];

// Metadata about each story for SEO and display purposes
export const STORY_METADATA: Record<string, { 
  title: string; 
  description: string;
  keywords: string[];
}> = {
  'abraham': {
    title: 'The Story of Abraham (Ibrahim) in Islamic Texts',
    description: 'Discover verses about Prophet Abraham (Ibrahim) from various Islamic texts and translations of the Quran.',
    keywords: ['Abraham', 'Ibrahim']
  },
  'moses': {
    title: 'The Story of Moses (Musa) in Islamic Texts',
    description: 'Explore verses about Prophet Moses (Musa) from various Islamic texts and translations of the Quran.',
    keywords: ['Moses', 'Musa', 'Pharaoh', 'Egypt']
  },
  'jesus': {
    title: 'The Story of Jesus (Isa) in Islamic Texts',
    description: 'Read verses about Prophet Jesus (Isa) from various Islamic texts and translations of the Quran.',
    keywords: ['Jesus', 'Isa', 'Mary']
  },
  'muhammad': {
    title: 'The Story of Muhammad in Islamic Texts',
    description: 'Learn about Prophet Muhammad from various Islamic texts and translations of the Quran.',
    keywords: ['Muhammad', 'Islam', 'Quran', 'Messenger']
  }
};

// Helper function to check if a story is allowed
export function isStoryAllowed(name: string): boolean {
  return ALLOWED_STORIES.includes(name);
}

// Helper function to get story metadata
export function getStoryMetadata(name: string) {
  return STORY_METADATA[name] || {
    title: `The Story of ${name.charAt(0).toUpperCase() + name.slice(1)}`,
    description: `Discover verses about ${name} from various Islamic texts and translations of the Quran.`,
    keywords: [name, 'Islam', 'Quran']
  };
}
