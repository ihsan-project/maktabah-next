This is a library for Muslim scholars and students. Let's create an environment that makes them feel like they are growing their minds and experiencing knowledge of the ages in friendly and inviting atmosphere.

# P0: Most Important Rules (Ask before breaking)
1. Don't generate summary report files after task is done.
2. Keep the codebase very clean and organized
3. Avoid duplication of code whenever possible, which means checking for other areas of the codebase that might already have similar code and functionality  
4. Avoid having files over 1000 lines of code. Refactor at that point.
5. Never overwrite .env file without first asking and confirming


# P1: Priority Rules
- Focus on the areas of the code relevant to the task
    - do not touch code that is unrelated to the task
- Avoid making major changes to the patterns and architecture of how a feature works, after it has shown to work well, unless explicitly instructed
– Always prefer simple solutions
– When fixing an issue or bug, do not introduce a new pattern or technology without first exhausting all options for the existing implementation. And if you finally do this, make sure to remove the old implementation afterwards so we don’t have duplicate logic.  
– Mocking data is only needed for tests, never mock data for dev or prod


# P2: Low Priority Rules
- always think about what other methods and areas of the code might be affected by code changes
 – Never add stubbing or fake data patterns to code that affects the dev or prod environments
