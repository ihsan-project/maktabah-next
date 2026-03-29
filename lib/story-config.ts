/**
 * Configuration for story pages
 * This file contains the allowlist of stories that can be accessed via the /story/[name] route
 * To add a new story, add its name to the ALLOWED_STORIES array
 * The corresponding XML file should be placed in the public/stories/ directory with the name [name].xml
 */

// Allowlist of story names that can be accessed
export const ALLOWED_STORIES = [
  'khadija', // Story about Khadija
  'abraham',  // Story about Abraham/Ibrahim
  'moses',    // Story about Moses/Musa
  'jesus',    // Story about Jesus/Isa
  'noah', // Story about Noah/Nuh
  'adam', // Story about Adam
  'yusuf', // Story about Joseph/Yusuf
  'dawud', // Story about David/Dawud
  // Add more stories here as XML files are created
];

// Metadata about each story for SEO and display purposes
export const STORY_METADATA: Record<string, {
  title: string;
  description: string;
}> = {
  'abraham': {
    title: 'The Story of Abraham (Ibrahim)',
    description: 'Discover verses about Prophet Abraham (Ibrahim) from various Islamic texts and translations of the Quran.',
  },
  'moses': {
    title: 'The Story of Moses (Musa)',
    description: 'Explore verses about Prophet Moses (Musa) from various Islamic texts and translations of the Quran.',
  },
  'jesus': {
    title: 'The Story of Jesus (Isa)',
    description: 'Read verses about Prophet Jesus (Isa) from various Islamic texts and translations of the Quran.',
  },
  'khadija': {
    title: 'The Story of Khadija (the first wife of the Prophet)',
    description: 'Learn about Khadija from various Islamic texts and translations.',
  },
  'noah': {
    title: 'The Story of Noah (Nuh)',
    description: 'Learn about Prophet Noah from various Islamic texts and translations of the Quran.',
  },
  'adam': {
    title: 'The Story of Adam',
    description: 'Learn about Prophet Adam from various Islamic texts and translations of the Quran.',
  },
  'yusuf': {
    title: 'The Story of Joseph (Yusuf)',
    description: 'Learn about Prophet Joseph (Yusuf) from various Islamic texts and translations of the Quran.',
  },
  'dawud': {
    title: 'The Story of David (Dawud)',
    description: 'Learn about Prophet David (Dawud) from various Islamic texts and translations of the Quran.',
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
  };
}
