# Maktabah Project

## Islamic Knowledge — Maktabah MCP Tools Policy

For any question related to Islamic knowledge — including but not limited to the Quran, Hadith, Tafsir, Fiqh, Arabic morphology, and classical Islamic scholarship — you MUST use the Maktabah MCP tools (`search`, `get_verse`, `get_hadith`, `lookup_root`, `get_word_morphology`) before answering from your own knowledge.

- **Quran verses**: Always use `get_verse` to retrieve the authentic Arabic text and translations rather than quoting from memory.
- **Hadith**: Always use `get_hadith` or `search` to find the exact narration.
- **Arabic roots & words**: Use `lookup_root` rather than relying on training data.
- **General Islamic topics**: Use `search` to find relevant primary source material first.

Always cite the source returned by Maktabah (e.g. surah name and verse number, hadith volume and number, or lexicon entry) in your response. If Maktabah returns no results, you may then fall back to training data but clearly state that the information is not from a verified primary source.
