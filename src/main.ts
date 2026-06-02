import grapesjs, { type Editor } from 'grapesjs';
import grapesJSMJML from 'grapesjs-mjml';
import 'grapesjs/dist/css/grapes.min.css';
import './style.css';

const IMAGE_SRC = 'https://picsum.photos/id/1015/640/360';

const MJML = `
  <mjml>
    <mj-body>
      <mj-section padding="24px" background-color="#f8fafc">
        <mj-column>
          <mj-image
            width="240px"
            border-radius="12px"
            alt="Mountain lake"
            src="${IMAGE_SRC}"
          />
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
`;

// Injected into each canvas iframe: any freshly mounted <img> fades in.
// The baseline recreates the <img> on every update, so the animation replays
// (a visible flash); the patched editor keeps the node, so it never replays.
const FLASH_STYLE = `
  img { animation: reconcile-flash 600ms ease; }
  @keyframes reconcile-flash { from { opacity: 0; } to { opacity: 1; } }
`;

type ImageComponent = {
  addStyle(style: Record<string, string>): void;
  set(name: string, value: unknown): void;
  getEl(): HTMLElement;
};

type Demo = {
  image: ImageComponent;
  metrics: HTMLElement;
  reload: number;
  replacements: number;
  result: HTMLElement;
  updates: number;
  width: number;
};

const syncAttributes = (currentEl: Element, nextEl: Element) => {
  Array.from(currentEl.attributes).forEach(({ name }) => {
    if (!nextEl.hasAttribute(name)) {
      currentEl.removeAttribute(name);
    }
  });

  Array.from(nextEl.attributes).forEach(({ name, value }) => {
    if (currentEl.getAttribute(name) !== value) {
      currentEl.setAttribute(name, value);
    }
  });
};

const reconcileNode = (currentNode: Node, nextNode: Node) => {
  if (currentNode.nodeType !== nextNode.nodeType || currentNode.nodeName !== nextNode.nodeName) {
    currentNode.parentNode!.replaceChild(nextNode.cloneNode(true), currentNode);
    return;
  }

  if (currentNode.nodeType === Node.TEXT_NODE) {
    if (currentNode.textContent !== nextNode.textContent) {
      currentNode.textContent = nextNode.textContent;
    }
    return;
  }

  if (currentNode.nodeType === Node.ELEMENT_NODE) {
    syncAttributes(currentNode as Element, nextNode as Element);
  }

  reconcileChildren(currentNode, nextNode);
};

const reconcileChildren = (currentParent: Node, nextParent: Node) => {
  const currentChildren = Array.from(currentParent.childNodes);
  const nextChildren = Array.from(nextParent.childNodes);
  const length = Math.max(currentChildren.length, nextChildren.length);

  for (let index = 0; index < length; index++) {
    const currentNode = currentChildren[index];
    const nextNode = nextChildren[index];

    if (!currentNode) {
      currentParent.appendChild(nextNode.cloneNode(true));
    } else if (!nextNode) {
      currentParent.removeChild(currentNode);
    } else {
      reconcileNode(currentNode, nextNode);
    }
  }
};

const patchMjImageRenderer = (editor: Editor) => {
  const imageType = editor.Components.getType('mj-image');
  const prototype = imageType?.view.prototype;

  if (!prototype) {
    throw new Error('Could not find the mj-image view');
  }

  prototype.render = function(_p: unknown, _c: unknown, _opts: unknown, appendChildren: boolean) {
    this.renderAttributes();
    const nextEl = this.el.cloneNode() as HTMLElement;
    nextEl.innerHTML = this.getTemplateFromMjml();

    if (this.el.hasChildNodes()) {
      reconcileChildren(this.el, nextEl);
    } else {
      this.el.innerHTML = nextEl.innerHTML;
    }

    this.renderChildren(appendChildren);
    this.childNodes = this.getChildrenContainer().childNodes;
    this.renderStyle();
    this.postRender();

    return this;
  };
};

const waitForLoad = (editor: Editor) =>
  new Promise<void>((resolve) => {
    editor.on('load', () => resolve());
  });

const waitForImage = async (editor: Editor) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    const image = editor.getWrapper()!.findType('mj-image')[0] as ImageComponent | undefined;

    if (image?.getEl()?.querySelector('img')) {
      return image;
    }

    await new Promise(requestAnimationFrame);
  }

  throw new Error('Rendered mj-image was not ready');
};

const injectFlashStyle = (editor: Editor) => {
  const doc = editor.Canvas.getDocument();

  if (!doc) {
    return;
  }

  const style = doc.createElement('style');
  style.textContent = FLASH_STYLE;
  doc.head.appendChild(style);
};

const createDemo = async (id: 'baseline' | 'patched') => {
  const editor = grapesjs.init({
    container: `#${id}-editor`,
    height: '430px',
    noticeOnUnload: false,
    panels: { defaults: [] },
    plugins: [grapesJSMJML],
    storageManager: false,
  });

  if (id === 'patched') {
    patchMjImageRenderer(editor);
  }

  await waitForLoad(editor);
  injectFlashStyle(editor);
  editor.addComponents(MJML);

  return {
    image: await waitForImage(editor),
    metrics: document.querySelector(`#${id}-metrics`)!,
    reload: 0,
    replacements: 0,
    result: document.querySelector(`#${id}-result`)!,
    updates: 0,
    width: 240,
  } satisfies Demo;
};

const updateDemo = (demo: Demo) => {
  const before = demo.image.getEl().querySelector('img');
  demo.width = demo.width === 240 ? 420 : 240;
  demo.reload += 1;
  // Force a real network reload so the difference is visible: the baseline
  // mounts a brand-new <img> that blanks until it re-fetches, while the patched
  // editor keeps the already-painted node and swaps its src in place.
  demo.image.set('src', `${IMAGE_SRC}?reload=${demo.reload}`);
  demo.image.addStyle({ width: `${demo.width}px` });
  const after = demo.image.getEl().querySelector('img');
  const preserved = before === after;

  demo.updates++;
  demo.replacements += preserved ? 0 : 1;
  demo.result.className = `result ${preserved ? 'preserved' : 'replaced'}`;
  demo.result.textContent = preserved ? 'PRESERVED' : 'REPLACED';
  demo.metrics.textContent = `Updates: ${demo.updates} | Replacements: ${demo.replacements}`;
};

const setup = async () => {
  const [baseline, patched] = await Promise.all([createDemo('baseline'), createDemo('patched')]);
  const toggleAll = document.querySelector<HTMLButtonElement>('#toggle-all')!;
  const toggleAuto = document.querySelector<HTMLButtonElement>('#toggle-auto')!;
  let timer: ReturnType<typeof setInterval> | undefined;

  const toggle = () => {
    updateDemo(baseline);
    updateDemo(patched);
  };

  toggleAll.disabled = false;
  toggleAuto.disabled = false;
  toggleAll.onclick = toggle;
  toggleAuto.onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
      toggleAuto.textContent = 'Start auto toggle';
    } else {
      toggle();
      timer = setInterval(toggle, 800);
      toggleAuto.textContent = 'Stop auto toggle';
    }
  };

  if (new URLSearchParams(window.location.search).has('auto')) {
    toggle();
  }
};

setup().catch((error) => {
  console.error(error);
  document.body.dataset.error = 'true';
});
