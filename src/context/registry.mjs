// The section list, and selection against a profile.
//
// A section owns its text and its predicate in one file, the same shape as a
// rule family in src/standard/. Splitting them is how a section ends up
// claiming to apply in a case its text does not cover.

import * as advancedCapability from './sections/advanced-capability.mjs';
import * as apiRoutes from './sections/api-routes.mjs';
import * as architecture from './sections/architecture.mjs';
import * as candidateFiltering from './sections/candidate-filtering.mjs';
import * as commands from './sections/commands.mjs';
import * as completionReport from './sections/completion-report.mjs';
import * as dataPlatform from './sections/data-platform.mjs';
import * as definitionOfDone from './sections/definition-of-done.mjs';
import * as domainProcessor from './sections/domain-processor.mjs';
import * as frameworkWarning from './sections/framework-warning.mjs';
import * as header from './sections/header.mjs';
import * as inputExtraction from './sections/input-extraction.mjs';
import * as manualRuns from './sections/manual-runs.mjs';
import * as operatingSequence from './sections/operating-sequence.mjs';
import * as privilegedAccess from './sections/privileged-access.mjs';
import * as processModel from './sections/process-model.mjs';
import * as product from './sections/product.mjs';
import * as promptFiles from './sections/prompt-files.mjs';
import * as recordValidation from './sections/record-validation.mjs';
import * as scheduler from './sections/scheduler.mjs';
import * as security from './sections/security.mjs';
import * as skills from './sections/skills.mjs';
import * as sourceSelection from './sections/source-selection.mjs';
import * as storageRules from './sections/storage-rules.mjs';
import * as techStack from './sections/tech-stack.mjs';
import * as testingOutput from './sections/testing-output.mjs';
import * as visualTesting from './sections/visual-testing.mjs';
import * as workflow from './sections/workflow.mjs';

/**
 * Array order is the document order. Unnumbered blocks are placed by position in
 * this array rather than by a sort, because some belong before section 1 and others
 * after section 23.
 */
export const SECTIONS = [
  header, frameworkWarning, product, workflow, skills, promptFiles, architecture,
  techStack, dataPlatform, sourceSelection, processModel, storageRules,
  inputExtraction, candidateFiltering, recordValidation, apiRoutes,
  privilegedAccess, manualRuns, testingOutput, scheduler, domainProcessor,
  advancedCapability, security, commands, visualTesting, definitionOfDone,
  completionReport, operatingSequence,
];

/**
 * Which sections this repository gets, and why the rest were left out.
 *
 * A section that does not apply is absent rather than filled with Unknown, and
 * the reason is reported so nobody has to guess whether it was skipped or
 * missed.
 */
export function selectSections({ signals }) {
  const included = [];
  const skipped = [];
  for (const section of SECTIONS) {
    if (section.when(signals)) included.push(section);
    else skipped.push({ id: section.id, title: section.title, reason: `requires ${section.requires ?? 'evidence this section applies'}` });
  }
  return { included, skipped };
}
