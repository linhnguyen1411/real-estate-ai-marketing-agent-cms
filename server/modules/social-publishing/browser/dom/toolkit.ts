/**
 * DomToolkit — bundles DomNavigator / Editor / Uploader / Publisher / Verifier / Evidence.
 */

import { DomEditor } from './DomEditor';
import { DomEvidence } from './DomEvidence';
import { DomNavigator } from './DomNavigator';
import { DomPublisher } from './DomPublisher';
import { DomUploader } from './DomUploader';
import { DomVerifier } from './DomVerifier';
import type { DomToolkitConfig } from './types';

export class DomToolkit {
  readonly navigator: DomNavigator;
  readonly editor: DomEditor;
  readonly uploader: DomUploader;
  readonly publisher: DomPublisher;
  readonly verifier: DomVerifier;
  readonly evidence: DomEvidence;
  readonly config: DomToolkitConfig;

  constructor(config: DomToolkitConfig) {
    this.config = config;
    this.navigator = new DomNavigator(config.selectors, config.flow);
    this.editor = new DomEditor(config.flow);
    this.uploader = new DomUploader(config.selectors, config.flow);
    this.publisher = new DomPublisher(config.selectors, config.flow);
    this.verifier = new DomVerifier(config.selectors, config.rules);
    this.evidence = new DomEvidence();
  }
}

export function createDomToolkit(config: DomToolkitConfig): DomToolkit {
  return new DomToolkit(config);
}
