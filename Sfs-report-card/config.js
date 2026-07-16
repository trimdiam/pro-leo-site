/**
 * config.js — St. Francis De Sales School Report Card System
 * Phase 1: Standalone Browser-Based
 *
 * Contains all class configurations (subjects, mark schemes, aggregates).
 * Kept separate from logic for future Firebase integration.
 */

const CONFIG = {
  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS I
  // ─────────────────────────────────────────────────────────────────────────────
  1: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 700,
    markScheme: "standard",
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",      isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",          isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_i",        label: "English I",        isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_ii",       label: "English II",       isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",            isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "spelling",         label: "Spelling",         isAggregate: false, components: [], countInTotal: true,  singleTotal: true  }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: []
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS II
  // ─────────────────────────────────────────────────────────────────────────────
  2: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 700,
    markScheme: "standard",
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",      isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",          isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_i",        label: "English I",        isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_ii",       label: "English II",       isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",            isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "spelling",         label: "Spelling",         isAggregate: false, components: [], countInTotal: true,  singleTotal: true  }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: []
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS III
  // ─────────────────────────────────────────────────────────────────────────────
  3: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 800,
    markScheme: "standard",
    passmark: 40,
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",      isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",          isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "social_studies",   label: "Social Studies",   isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",            isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "spelling",         label: "Spelling",         isAggregate: false, components: [], countInTotal: true,  singleTotal: true  },
      { key: "english_i",        label: "English I",        isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_ii",       label: "English II",       isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",isAggregate: false, components: [], countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: []
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS IV
  // ─────────────────────────────────────────────────────────────────────────────
  4: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 900,
    markScheme: "standard",
    passmark: 40,
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",      isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",          isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "computer",         label: "Computer",         isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",            isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "spelling",         label: "Spelling",         isAggregate: false, components: [], countInTotal: true,  singleTotal: true  },
      { key: "english_i",        label: "English I",        isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_ii",       label: "English II",       isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "social_studies",   label: "Social Studies",   isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",isAggregate: false, components: [], countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: []
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS V
  // ─────────────────────────────────────────────────────────────────────────────
  5: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 900,
    markScheme: "standard",
    passmark: 40,
    note: "Computer Practical included in Unit Test column",
    subjects: [
      { key: "mathematics",      label: "Mathematics",      isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",          isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "computer",         label: "Computer",         isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",            isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "spelling",         label: "Spelling",         isAggregate: false, components: [], countInTotal: true,  singleTotal: true  },
      { key: "english_i",        label: "English I",        isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "english_ii",       label: "English II",       isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "social_studies",   label: "Social Studies",   isAggregate: false, components: [], countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",isAggregate: false, components: [], countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: []
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS VI
  // ─────────────────────────────────────────────────────────────────────────────
  6: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 800,
    markScheme: "standard",
    passmark: 40,
    note: "Computer Practical included in Unit Test column",
    subjects: [
      { key: "mathematics",      label: "Mathematics",           isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",               isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "computer",         label: "Computer",              isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "hindi",            label: "Hindi",                 isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "geography",        label: "Geography",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "civics",           label: "Civics",                isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "history",          label: "History",               isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "s_science",        label: "S.Science (G+C+H)",     isAggregate: true,  components: ["geography", "civics", "history"], countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "english_i",        label: "English I",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_ii",       label: "English II",            isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_i_ii",     label: "English (I+II)",        isAggregate: true,  components: ["english_i", "english_ii"],        countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "health_education", label: "Health Education",      isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",    isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing",          label: "Singing" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "neatness",         label: "Neatness" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: [
      { key: "s_science",    components: ["geography", "civics", "history"] },
      { key: "english_i_ii", components: ["english_i", "english_ii"] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS VII
  // ─────────────────────────────────────────────────────────────────────────────
  7: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 700,
    markScheme: "standard",
    passmark: 40,
    note: "Computer Practical included in Unit Test column",
    subjects: [
      { key: "mathematics",      label: "Mathematics",           isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",               isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "computer",         label: "Computer",              isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "geography",        label: "Geography",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "civics",           label: "Civics",                isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "history",          label: "History",               isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "s_science",        label: "S.Science (G+C+H+E)",   isAggregate: true,  components: ["geography", "civics", "history"], countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "english_i",        label: "English I",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_ii",       label: "English II",            isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_i_ii",     label: "English (I+II)",        isAggregate: true,  components: ["english_i", "english_ii"],        countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "h_education",      label: "H.Education",           isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",    isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing_music",    label: "Singing/Music" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: [
      { key: "s_science",    components: ["geography", "civics", "history"] },
      { key: "english_i_ii", components: ["english_i", "english_ii"] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS VIII
  // ─────────────────────────────────────────────────────────────────────────────
  8: {
    schoolName: "St. Francis De Sales Sec. School",
    grandTotalMax: 700,
    markScheme: "standard",
    passmark: 40,
    note: "Computer Practical included in Unit Test column",
    subjects: [
      { key: "mathematics",      label: "Mathematics",           isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "science",          label: "Science",               isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "computer",         label: "Computer",              isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "geography",        label: "Geography",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "civics",           label: "Civics",                isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "history",          label: "History",               isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "s_science",        label: "S.Science (G+C+H+E)",   isAggregate: true,  components: ["geography", "civics", "history"], countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "english_i",        label: "English I",             isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_ii",       label: "English II",            isAggregate: false, components: [],                                 countInTotal: false, singleTotal: false },
      { key: "english_i_ii",     label: "English (I+II)",        isAggregate: true,  components: ["english_i", "english_ii"],        countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "h_education",      label: "H.Education",           isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",    isAggregate: false, components: [],                                 countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "pe",               label: "P.E." },
      { key: "singing_music",    label: "Singing/Music" },
      { key: "discipline",       label: "Discipline" },
      { key: "gk",               label: "Aptitude" },
      { key: "arts_craft",       label: "Arts & Craft" },
      { key: "val_edu_catechism",label: "Val. Edu./Catechism" }
    ],
    aggregates: [
      { key: "s_science",    components: ["geography", "civics", "history"] },
      { key: "english_i_ii", components: ["english_i", "english_ii"] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS IX
  // ─────────────────────────────────────────────────────────────────────────────
  9: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 600,
    markScheme: "senior",
    passmark: 30,
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",           isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false },
      { key: "physics",          label: "Physics",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "chemistry",        label: "Chemistry",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "biology",          label: "Biology",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "science_pcb",      label: "Science (P+C+B)",       isAggregate: true,  components: ["physics", "chemistry", "biology"],                  countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "geography",        label: "Geography",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "civics",           label: "Civics",                isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "history",          label: "History",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "economics",        label: "Economics",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "s_science",        label: "S.Science (G+C+H+E)",   isAggregate: true,  components: ["geography", "civics", "history", "economics"],      countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "english_i",        label: "English I",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "english_ii",       label: "English II",            isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "english_i_ii",     label: "English (I+II)",        isAggregate: true,  components: ["english_i", "english_ii"],                          countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "h_education",      label: "H.Education",           isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",    isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "val_edu_catechism",label: "Value Edu./Catechism" },
      { key: "handwriting",      label: "Handwriting" },
      { key: "singing",          label: "Singing" },
      { key: "pe",               label: "P.E." },
      { key: "discipline",       label: "Discipline" },
      { key: "supw",             label: "SUPW" }
    ],
    aggregates: [
      { key: "science_pcb",  components: ["physics", "chemistry", "biology"] },
      { key: "s_science",    components: ["geography", "civics", "history", "economics"] },
      { key: "english_i_ii", components: ["english_i", "english_ii"] }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS X
  // ─────────────────────────────────────────────────────────────────────────────
  10: {
    schoolName: "St. Francis De Sales School",
    grandTotalMax: 600,
    markScheme: "senior",
    passmark: 30,
    note: null,
    subjects: [
      { key: "mathematics",      label: "Mathematics",           isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false },
      { key: "physics",          label: "Physics",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "chemistry",        label: "Chemistry",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "biology",          label: "Biology",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "science_pcb",      label: "Science (P+C+B)",       isAggregate: true,  components: ["physics", "chemistry", "biology"],                  countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "geography",        label: "Geography",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "civics",           label: "Civics",                isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "history",          label: "History",               isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "economics",        label: "Economics",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "s_science",        label: "S.Science (G+C+H+E)",   isAggregate: true,  components: ["geography", "civics", "history", "economics"],      countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "english_i",        label: "English I",             isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "english_ii",       label: "English II",            isAggregate: false, components: [],                                                   countInTotal: false, singleTotal: false },
      { key: "english_i_ii",     label: "English (I+II)",        isAggregate: true,  components: ["english_i", "english_ii"],                          countInTotal: true,  singleTotal: false, aggregateMethod: "average" },
      { key: "h_education",      label: "H.Education",           isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false },
      { key: "khasi_alt_english",label: "Khasi/Alt. English",    isAggregate: false, components: [],                                                   countInTotal: true,  singleTotal: false }
    ],
    coScholastic: [
      { key: "val_edu_catechism",label: "Value Edu./Catechism" },
      { key: "handwriting",      label: "Handwriting" },
      { key: "singing",          label: "Singing" },
      { key: "pe",               label: "P.E." },
      { key: "discipline",       label: "Discipline" },
      { key: "supw",             label: "SUPW" }
    ],
    aggregates: [
      { key: "science_pcb",  components: ["physics", "chemistry", "biology"] },
      { key: "s_science",    components: ["geography", "civics", "history", "economics"] },
      { key: "english_i_ii", components: ["english_i", "english_ii"] }
    ]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZE CO-SCHOLASTIC ENTRIES (Phase 4 — grade-entry subjects)
// Co-scholastic activities are now assignable to subject teachers and entered
// as GRADES (O–C), not numeric marks. Tag each entry with the flags the mark-
// entry grid + assignment UI branch on. Done here (not inline per class) so all
// classes stay in sync and the raw config blocks remain readable.
//   entryType:'grade'   → render a grade dropdown, never IA/UT/TE inputs
//   isCoScholastic:true → distinguish from scholastic subjects everywhere
//   countInTotal:false  → structurally excluded from grand total & rank
// The remaining flags give co-scholastic the same SHAPE as a subject object so
// code that reads s.isAggregate / s.singleTotal / s.components won't choke.
// ─────────────────────────────────────────────────────────────────────────────
Object.keys(CONFIG).forEach(function (clsNum) {
  var list = CONFIG[clsNum] && CONFIG[clsNum].coScholastic;
  if (!Array.isArray(list)) return;
  list.forEach(function (item) {
    item.entryType     = 'grade';
    item.isCoScholastic = true;
    item.countInTotal  = false;
    item.isAggregate   = false;
    item.singleTotal   = false;
    if (!Array.isArray(item.components)) item.components = [];
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED-ENTRY (SPLIT) SUBJECTS — two teachers, one column
// Khasi/Alt. English and Val. Edu./Catechism are each taken by a DIFFERENT set
// of students under ONE mark slot, taught by TWO different teachers. Both are
// assigned and both see the full class list; each fills only their own students
// and leaves the rest blank. To make that safe, sharedEntry subjects:
//   • never write blank rows (so the two teachers' entries stay disjoint), and
//   • lock a cell already entered by the OTHER teacher (per-cell, via enteredBy).
// Tag here so all classes stay in sync. Storage key is unchanged → marksheet,
// report card and grand total are unaffected.
// ─────────────────────────────────────────────────────────────────────────────
var SHARED_ENTRY_KEYS = { khasi_alt_english: true, val_edu_catechism: true };
Object.keys(CONFIG).forEach(function (clsNum) {
  var cfg = CONFIG[clsNum];
  if (!cfg) return;
  [].concat(cfg.subjects || [], cfg.coScholastic || []).forEach(function (item) {
    if (SHARED_ENTRY_KEYS[item.key]) item.sharedEntry = true;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: retrieve configuration for a given class number
// ─────────────────────────────────────────────────────────────────────────────
function getClassConfig(classNum) {
  return CONFIG[classNum] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared aggregate / component-floor helpers (2026-07)
// Any page that renders a III-X report card from raw Firestore {academics}
// data (not already-computed subject rows) should use these instead of
// reimplementing the sum/average and pass-floor logic locally.
// ─────────────────────────────────────────────────────────────────────────────

// Aggregate subject {ia, exam, total} from its components' academics entries.
// Every isAggregate subject in this config is averaged (never summed) —
// matches grandTotalMax, which is sized for a 100-point average per counted
// subject. Averaging unconditionally rather than gating on an
// aggregateMethod==='average' flag: that flag has never once been anything
// else across every class, and requiring an exact string match created a
// silent-wrong-fallback (summing instead of averaging, inflating totals
// well past 100%) if the flag was ever missing/stale for any reason
// (2026-07-15 bug — Class VI-X showed >100% in Performance Analytics).
function computeAggregateSubject(academics, subj) {
  const comps = subj.components || [];
  let totalSum = 0, iaSum = 0, examSum = 0, count = 0;
  comps.forEach(k => {
    const a = academics?.[k];
    if (!a) return;
    totalSum += a.total ?? 0;
    iaSum    += a.IA ?? a.singleMark ?? 0;
    examSum  += a.TE ?? 0;
    count++;
  });
  return count > 0
    ? { ia: Math.round(iaSum / count), exam: Math.round(examSum / count), total: Math.round(totalSum / count) }
    : { ia: 0, exam: 0, total: 0 };
}

// Senior-scheme (Class 9/10) component pass floors, proportional to passmark:
// IA floor = 20 * passmark/100, Exam floor = 80 * passmark/100 (30 -> 6, 24).
// A subject fails if its total clears the passmark but IA or Exam don't.
function getComponentFloors(cfg) {
  const passmark = cfg.passmark || 40;
  return {
    iaFloor:   Math.round(20 * passmark / 100),
    examFloor: Math.round(80 * passmark / 100)
  };
}

function subjectFailsFloor(ia, exam, cfg, subj) {
  if (cfg.markScheme !== 'senior' || subj.singleTotal) return false;
  const { iaFloor, examFloor } = getComponentFloors(cfg);
  return ia < iaFloor || exam < examFloor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Development validation — console.log each class config and verify
// subject counts / grandTotalMax values match master-prompt requirements.
// Call validateConfig() in browser console to run.
// ─────────────────────────────────────────────────────────────────────────────
function validateConfig() {
  const expected = {
    1:  { subjects: 7,  grandTotalMax: 700, markScheme: "standard" },
    2:  { subjects: 7,  grandTotalMax: 700, markScheme: "standard" },
    3:  { subjects: 8,  grandTotalMax: 800, markScheme: "standard" },
    4:  { subjects: 9,  grandTotalMax: 900, markScheme: "standard" },
    5:  { subjects: 9,  grandTotalMax: 900, markScheme: "standard" },
    6:  { subjects: 13, grandTotalMax: 800, markScheme: "standard" },
    7:  { subjects: 12, grandTotalMax: 700, markScheme: "standard" },
    8:  { subjects: 12, grandTotalMax: 700, markScheme: "standard" },
    9:  { subjects: 15, grandTotalMax: 600, markScheme: "senior"   },
    10: { subjects: 15, grandTotalMax: 600, markScheme: "senior"   }
  };

  console.log("=== CONFIG VALIDATION ===");
  let allPassed = true;

  for (const [cls, exp] of Object.entries(expected)) {
    const cfg = CONFIG[cls];
    if (!cfg) {
      console.error(`Class ${cls}: MISSING config`);
      allPassed = false;
      continue;
    }

    const subjectCount = cfg.subjects.length;
    const countInTotal = cfg.subjects.filter(s => s.countInTotal).length;
    const calculatedMax = countInTotal * 100;

    console.log(`\nClass ${cls} — ${cfg.schoolName}:`);
    console.log(`  Subjects: ${subjectCount} (expected ${exp.subjects})`);
    console.log(`  countInTotal subjects: ${countInTotal} => calc max: ${calculatedMax}`);
    console.log(`  grandTotalMax: ${cfg.grandTotalMax} (expected ${exp.grandTotalMax})`);
    console.log(`  markScheme: ${cfg.markScheme} (expected ${exp.markScheme})`);

    if (subjectCount !== exp.subjects) {
      console.error(`  ❌ Subject count mismatch!`);
      allPassed = false;
    }
    if (cfg.grandTotalMax !== exp.grandTotalMax) {
      console.error(`  ❌ grandTotalMax mismatch!`);
      allPassed = false;
    }
    if (cfg.markScheme !== exp.markScheme) {
      console.error(`  ❌ markScheme mismatch!`);
      allPassed = false;
    }
    if (calculatedMax !== exp.grandTotalMax) {
      console.error(`  ❌ Calculated max (${calculatedMax}) ≠ grandTotalMax (${cfg.grandTotalMax})!`);
      allPassed = false;
    }

    // Validate aggregate definitions
    for (const agg of cfg.aggregates) {
      const aggSubj = cfg.subjects.find(s => s.key === agg.key);
      if (!aggSubj) {
        console.error(`  ❌ Aggregate '${agg.key}' not found in subjects!`);
        allPassed = false;
      } else if (!aggSubj.isAggregate) {
        console.error(`  ❌ Subject '${agg.key}' not marked isAggregate!`);
        allPassed = false;
      }
      for (const comp of agg.components) {
        if (!cfg.subjects.find(s => s.key === comp)) {
          console.error(`  ❌ Component '${comp}' of aggregate '${agg.key}' missing!`);
          allPassed = false;
        }
      }
    }
  }

  console.log(`\n=== VALIDATION ${allPassed ? "PASSED ✅" : "FAILED ❌"} ===`);
  return allPassed;
}

console.log("config.js loaded. Call validateConfig() to verify.");
