/**
 * Configuration for story pages
 * This file contains the allowlist of stories that can be accessed via the /story/[name] route
 * To add a new story, add its name to the ALLOWED_STORIES array
 * The corresponding XML file should be placed in the public/stories/ directory with the name [name].xml
 */

// Allowlist of story names that can be accessed
export const ALLOWED_STORIES = [
  'adam',
  'noah',
  'abraham',
  'ismail_ishaq',
  'yusuf',
  'ayyub',
  'moses',
  'dawud',
  'sulayman',
  'yunus',
  'maryam',
  'jesus',
  'khadija',
  // Add more stories here as XML files are created
];

// Metadata about each story for SEO and display purposes
export const STORY_METADATA: Record<string, {
  title: string;
  description: string;
}> = {
  'adam': {
    title: 'The Story of Adam',
    description: 'The first human, created from clay and honoured with knowledge of the names. From the Garden to the earth, a story of free will, repentance, and the covenant between humanity and its Creator.',
  },
  'noah': {
    title: 'The Story of Noah (Nuh)',
    description: 'A prophet who called his people for centuries, built the Ark by divine command, and sailed through the great flood. A testament to unwavering faith in the face of relentless rejection.',
  },
  'abraham': {
    title: 'The Story of Abraham (Ibrahim)',
    description: 'The friend of God who shattered idols, survived the fire, and journeyed across lands to establish the sacred house in Mecca. Father of prophets and the model of submission to the Divine.',
  },
  'ismail_ishaq': {
    title: 'The Story of Ishmael & Isaac (Ismail & Ishaq)',
    description: 'Two sons of Abraham through whom prophecy continued. From the sacrifice at Mina and the building of the Kaaba, to the glad tidings of Isaac and the prophetic line of Israel.',
  },
  'yusuf': {
    title: 'The Story of Joseph (Yusuf)',
    description: 'Thrown into a well by his brothers, sold into slavery, imprisoned on false charges, then raised to govern Egypt. The most beautiful of stories, as the Quran itself describes it.',
  },
  'ayyub': {
    title: 'The Story of Job (Ayyub)',
    description: 'A prophet who lost his health, wealth, and family yet never lost his faith. His patience became legendary, and God restored to him double what he had lost.',
  },
  'moses': {
    title: 'The Story of Moses (Musa)',
    description: 'Rescued from the Nile as an infant, called by God at the burning bush, and sent to confront Pharaoh. He parted the sea, received the Torah, and led the Israelites to freedom.',
  },
  'dawud': {
    title: 'The Story of David (Dawud)',
    description: 'A shepherd who slew Goliath, a king who ruled with justice, and a prophet to whom the Psalms were revealed. The mountains and birds joined him in glorifying God.',
  },
  'sulayman': {
    title: 'The Story of Solomon (Sulayman)',
    description: 'Heir to David, gifted with wisdom and dominion over the wind, the jinn, and the language of birds. From the valley of ants to the court of the Queen of Sheba, a kingdom like no other.',
  },
  'yunus': {
    title: 'The Story of Jonah (Yunus)',
    description: 'A prophet who departed in anger, was swallowed by a whale, and cried out from the depths of darkness. His repentance was accepted, and his people became the only nation saved by their faith.',
  },
  'maryam': {
    title: 'The Story of Mary (Maryam)',
    description: 'Chosen above the women of all worlds, dedicated to God before birth, and sustained by miracles in the temple. She bore Jesus by divine word and defended her honour through his first miracle.',
  },
  'jesus': {
    title: 'The Story of Jesus (Isa)',
    description: 'Born of a miraculous word, he spoke from the cradle, healed the blind, and raised the dead by God\'s leave. A messenger to the Children of Israel and a sign for all of humanity.',
  },
  'khadija': {
    title: 'The Story of Khadija',
    description: 'The first to believe, the wife who sheltered the Prophet in his most vulnerable moment. A successful merchant, a devoted mother, and one of the four greatest women in history.',
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
