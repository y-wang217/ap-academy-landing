# REQ-23 Parent 2/4: Grades tab, the student dashboard read-only plus recent marks

Approved design: https://app.notion.com/p/3fbd6ae73dd78164bd5af4dcb04139d8

Summary: the parent's Grades tab renders the child's student dashboard through `buildParentGrades` (same view model, flags dropped), adds a "Recent marks" card of the 5 newest scored marks, and keeps the grade footer last on the page. `StudentDashboard` gains optional `readOnly`, optional `courseHref` and `afterSubjects`. `parentGradesState` decides not-ready without calling the loader for an unpublished child. No migration.

Build note: the design's AC5 expected the story headline to match `/of 6 courses graded\./`. With the e2e fixture (three courses marked, two below target) the headline is "2 courses are below their targets: MCV4U and SPH4U.", and "3 of 6 courses graded" is the progress count line, so the e2e asserts those two instead.
