---
name: documentation
description: Writes documentation for software development process. Use when there are changes made to the software architecture, usually prompted when the user asks "update documentation to.."
---

# Doc update rules
- Avoid adding obvious code for basic examples. 
  - Add code if there's some special implementation details that can only be shown through code
- Don't add implementation status or phase details
- Don't do version or dates

### If Requirements Conflict
1. Document the conflict in your response
2. Propose a resolution based on:
   - Existing architecture patterns
   - Security and performance best practices
   - User experience principles
3. Request developer decision before proceeding

### If Requirements Are Unclear
1. State what is unclear
2. Provide 2-3 options based on best practices
3. Request clarification before implementation

### Never Assume
- Don't guess at data structures or API contracts
- Don't create placeholder/mock data for non-test code
- Don't skip security or validation requirements
