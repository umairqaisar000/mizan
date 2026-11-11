# Writing standards for change notes, RCAs and handoffs

These documents are read by developers, managers and non-technical people. Write so all of them understand.

- Short sentences. One idea per sentence. Active voice: "The page now saves your draft", not "Drafts are now saved by the page".
- Lead with the outcome, then the detail.
- Plain words first. When a technical term is needed, explain it in the same sentence the first time: "a migration (a script that changes the database structure)".
- Be specific: name the screen, the button, the file, the number. "Faster" means nothing; "loads in 1.2s instead of 4s" means something.
- The "How it works" section teaches. Walk through the flow in order, name the key functions and files, and say why this design was chosen. A developer new to the code should be able to change it safely after reading it.
- Be honest about risks, shortcuts and what was not done.
- No em dashes. Use a colon, a full stop, or a plain hyphen.
- No filler ("This PR aims to...", "In order to..."). No marketing tone.
