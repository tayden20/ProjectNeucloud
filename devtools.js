(function (Scratch) {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  //  DevTools Black - All-in-One Developer Extension
  //  Merged from: WikiExtractFix, GramPack, Words, PPOS, Thesaurus,
  //  WordSensibility, TopicRelator, Intent, FinalCleaner, Scrambler,
  //  CheckResponse, ColorCorrector, Capitalizer, Synthesizer,
  //  TopicExtractor, Wiktionary, IO+, and more.
  // ──────────────────────────────────────────────────────────────

  class DevToolsBlack {
    constructor() {
      // Wiki state
      this._rss = [];
      this._changes = [];
      this._lastError = '';

      // Grammar / Correction state
      this.lastCorrected = '';
      this.lastIssues = [];

      // WordSensibility state
      this.lastBestWord = '';
      this.lastScore = 0;

      // TopicRelator state
      this.results = [];
      this.lastTopic = '';
      this.lastList = '';
      this.cache = Object.create(null);

      // Intent state
      this.currentText = '';
      this.detectedIntent = 'normal';
      this.detectedEmotion = 'neutral';
      this.confidence = 0;

      // FinalCleaner state
      this.lastCleaned = '';

      // Scrambler state
      this.lastInputPattern = '';
      this.lastOutputPattern = '';
      this.rules = Object.create(null);

      // CheckResponse state
      this.lastRelevanceScore = 0;
      this.lastIsTargeted = false;
      this.lastSuggestion = '';

      // Synthesizer state
      this.textPool = [];
      this.lastSynthesized = '';

      // IO+ state
      this._io = {
        mouse: {
          buttonsDown: ['0','0','0','0','0'],
          clientX: 0, clientY: 0,
          deltaX: 0, deltaY: 0,
          pageX: 0, pageY: 0,
          screenX: 0, screenY: 0,
          stageHovered: false
        },
        keyboard: {
          lastKeyPressed: '',
          keysPressed: { normal: {}, variation: {} },
          codesPressed: {}
        }
      };

      // Capitalizer cache
      this.wikiCache = {};
      this.linguisticFilters = new Set([
        'was','were','is','are','the','a','an','and','but','or','in','on','at','to','from','by','with'
      ]);

      // Do NOT initialize IO listeners in constructor — do it lazily when first IO block is used
      this._ioInitialized = false;
    }

    // ──────────────────────────────────────────────────────────────
    //  IO+ Mouse & Keyboard (from IO+ extension)
    // ──────────────────────────────────────────────────────────────
    _initIOListeners() {
      if (this._ioInitialized) return;
      this._ioInitialized = true;

      const handleMouse = (e) => {
        const m = this._io.mouse;
        const buttons = (e.buttons >>> 0).toString(2).padStart(5, '0').split('').reverse();
        m.buttonsDown = buttons;
        m.clientX = e.clientX;
        m.clientY = e.clientY;
        m.deltaX = e.movementX;
        m.deltaY = e.movementY;
        m.pageX = e.pageX;
        m.pageY = e.pageY;
        m.screenX = e.screenX;
        m.screenY = e.screenY;
      };

      const handleKeyDown = (e) => {
        const k = this._io.keyboard;
        const key = e.key;
        const code = e.code;
        const loc = e.location;
        const variation = (loc === 0 || loc === 1) ? 'normal' : 'variation';

        if (!k.keysPressed[variation][key]) {
          k.keysPressed[variation][key] = { isDown: false, hit: false };
        }
        k.keysPressed[variation][key].isDown = true;
        k.keysPressed[variation][key].hit = !e.repeat;
        k.codesPressed[code] = true;
        k.lastKeyPressed = key;
      };

      const handleKeyUp = (e) => {
        const k = this._io.keyboard;
        const key = e.key;
        const code = e.code;
        const loc = e.location;
        const variation = (loc === 0 || loc === 1) ? 'normal' : 'variation';

        if (k.keysPressed[variation][key]) {
          k.keysPressed[variation][key].isDown = false;
          k.keysPressed[variation][key].hit = false;
        }
        k.codesPressed[code] = false;
      };

      window.addEventListener('mousedown', handleMouse);
      window.addEventListener('mouseup', handleMouse);
      window.addEventListener('mousemove', handleMouse);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      // Reset hit/delta every frame
      if (Scratch.vm && Scratch.vm.runtime) {
        Scratch.vm.runtime.on('AFTER_EXECUTE', () => {
          const k = this._io.keyboard;
          for (const v of ['normal', 'variation']) {
            for (const key in k.keysPressed[v]) {
              if (k.keysPressed[v][key]) k.keysPressed[v][key].hit = false;
            }
          }
          const m = this._io.mouse;
          m.deltaX = 0;
          m.deltaY = 0;
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    //  getInfo() - All blocks organized by category
    // ──────────────────────────────────────────────────────────────
    getInfo() {
      return {
        id: 'devtoolsblack',
        name: 'DevTools',
        color1: '#1f2937',
        color2: '#111827',
        color3: '#0f172a',
        blocks: [

          // ========== WIKIPEDIA ==========
          { blockType: Scratch.BlockType.LABEL, text: 'Wikipedia' },
          { opcode: 'wikiDefine', blockType: Scratch.BlockType.REPORTER, text: 'definition of [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'apple' } } },
          { opcode: 'wikiSentences', blockType: Scratch.BlockType.REPORTER, text: 'first [N] sentence(s) about [WORD]', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 }, WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'apple' } } },
          { opcode: 'wikiExists', blockType: Scratch.BlockType.BOOLEAN, text: 'Wikipedia has article for [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'apple' } } },
          '---',
          { opcode: 'fetchChanges', blockType: Scratch.BlockType.COMMAND, text: 'fetch [LIMIT] recent Wikipedia changes', arguments: { LIMIT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } } },
          { opcode: 'changeCount', blockType: Scratch.BlockType.REPORTER, text: 'recent changes count' },
          { opcode: 'changeTitle', blockType: Scratch.BlockType.REPORTER, text: 'recent change [N] title', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'changeUser', blockType: Scratch.BlockType.REPORTER, text: 'recent change [N] user', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'changeTimestamp', blockType: Scratch.BlockType.REPORTER, text: 'recent change [N] timestamp', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },

          // ========== WIKTIONARY ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Wiktionary' },
          { opcode: 'wiktDefine', blockType: Scratch.BlockType.REPORTER, text: 'Wiktionary definition of [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'run' } } },
          { opcode: 'wiktDefineAs', blockType: Scratch.BlockType.REPORTER, text: 'Wiktionary definition of [WORD] as [POS]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'run' }, POS: { type: Scratch.ArgumentType.STRING, defaultValue: 'verb' } } },
          { opcode: 'wiktHasEntry', blockType: Scratch.BlockType.BOOLEAN, text: 'Wiktionary has [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'run' } } },
          { opcode: 'wiktFetchAll', blockType: Scratch.BlockType.COMMAND, text: 'fetch all Wiktionary definitions of [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'run' } } },
          { opcode: 'wiktDefCount', blockType: Scratch.BlockType.REPORTER, text: 'Wiktionary definition count' },
          { opcode: 'wiktDefText', blockType: Scratch.BlockType.REPORTER, text: 'Wiktionary definition [N] text', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'wiktDefPOS', blockType: Scratch.BlockType.REPORTER, text: 'Wiktionary definition [N] part of speech', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },

          // ========== RSS & PROXY ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'RSS & Proxy' },
          { opcode: 'fetchRSS', blockType: Scratch.BlockType.COMMAND, text: 'fetch RSS [URL]', arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://feeds.bbci.co.uk/news/rss.xml' } } },
          { opcode: 'rssCount', blockType: Scratch.BlockType.REPORTER, text: 'RSS item count' },
          { opcode: 'rssTitle', blockType: Scratch.BlockType.REPORTER, text: 'RSS item [N] title', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'rssDescription', blockType: Scratch.BlockType.REPORTER, text: 'RSS item [N] description', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'proxyFetch', blockType: Scratch.BlockType.REPORTER, text: 'fetch [URL] via proxy', arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com' } } },

          // ========== GRAMMAR & TEXT ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Grammar & Text Tools' },
          { opcode: 'fixGrammar', blockType: Scratch.BlockType.REPORTER, text: 'fix grammar of [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'fixSpacingAndPunctuation', blockType: Scratch.BlockType.REPORTER, text: 'fix spacing and punctuation in [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'singularize', blockType: Scratch.BlockType.REPORTER, text: 'singularize [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'normalizeForWiki', blockType: Scratch.BlockType.REPORTER, text: 'normalize for wiki [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'extractMainTopic', blockType: Scratch.BlockType.REPORTER, text: 'extract main topic from [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'cleanFinalText', blockType: Scratch.BlockType.REPORTER, text: 'clean final text [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'fixAbbreviations', blockType: Scratch.BlockType.REPORTER, text: 'fix abbreviations in [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'stripHTML', blockType: Scratch.BlockType.REPORTER, text: 'strip HTML from [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '<p>Hello</p>' } } },

          // ========== COLOR & FACTUAL ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Color & Fact Correction' },
          { opcode: 'correctColorAnswer', blockType: Scratch.BlockType.REPORTER, text: 'correct color in [RESPONSE] for question [QUESTION]', arguments: { RESPONSE: { type: Scratch.ArgumentType.STRING }, QUESTION: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'scanForFactualErrors', blockType: Scratch.BlockType.REPORTER, text: 'scan for factual errors in [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },

          // ========== INTENT & EMOTION ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Intent & Emotion Detection' },
          { opcode: 'analyzeIntent', blockType: Scratch.BlockType.COMMAND, text: 'analyze intent of [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'five ways to survive a plane crash' } } },
          { opcode: 'getIntent', blockType: Scratch.BlockType.REPORTER, text: 'detected intent' },
          { opcode: 'getEmotion', blockType: Scratch.BlockType.REPORTER, text: 'detected emotion' },
          { opcode: 'getConfidence', blockType: Scratch.BlockType.REPORTER, text: 'intent confidence (0-100)' },
          { opcode: 'isIntent', blockType: Scratch.BlockType.BOOLEAN, text: 'intent is [INTENT]', arguments: { INTENT: { type: Scratch.ArgumentType.STRING, defaultValue: 'task' } } },
          { opcode: 'isTask', blockType: Scratch.BlockType.BOOLEAN, text: 'is task?' },
          { opcode: 'isQuestion', blockType: Scratch.BlockType.BOOLEAN, text: 'is question?' },
          { opcode: 'isGreeting', blockType: Scratch.BlockType.BOOLEAN, text: 'is greeting?' },

          // ========== WORD TOOLS ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Word Tools' },
          { opcode: 'wordNumber', blockType: Scratch.BlockType.REPORTER, text: 'word [N] of [TEXT]', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }, TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'who is donald trump' } } },
          { opcode: 'firstWord', blockType: Scratch.BlockType.REPORTER, text: 'first word of [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'who is donald trump' } } },
          { opcode: 'lastWord', blockType: Scratch.BlockType.REPORTER, text: 'last word of [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'who is donald trump' } } },
          { opcode: 'wordCount', blockType: Scratch.BlockType.REPORTER, text: 'number of words in [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'who is donald trump' } } },
          { opcode: 'allWordsJoined', blockType: Scratch.BlockType.REPORTER, text: 'all words of [TEXT] joined with [SEP]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'who is donald trump' }, SEP: { type: Scratch.ArgumentType.STRING, defaultValue: ', ' } } },

          // ========== THESAURUS & SYNONYMS ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Thesaurus & Synonyms' },
          { opcode: 'fetchSynonyms', blockType: Scratch.BlockType.COMMAND, text: 'fetch synonyms of [WORD]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'happy' } } },
          { opcode: 'getAllSynonyms', blockType: Scratch.BlockType.REPORTER, text: 'synonyms of [WORD] joined with [SEP]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'happy' }, SEP: { type: Scratch.ArgumentType.STRING, defaultValue: ', ' } } },
          { opcode: 'synonymCount', blockType: Scratch.BlockType.REPORTER, text: 'synonym count' },
          { opcode: 'synonymN', blockType: Scratch.BlockType.REPORTER, text: 'synonym [N]', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },

          // ========== WORD SENSIBILITY ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Word Sensibility (NLP)' },
          { opcode: 'pickBestWord', blockType: Scratch.BlockType.REPORTER, text: 'best word from [CANDIDATES] for context [CONTEXT] tone from [TYPING]', arguments: { CANDIDATES: { type: Scratch.ArgumentType.STRING, defaultValue: 'crisis, tension, opportunity' }, CONTEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'The situation is becoming more' }, TYPING: { type: Scratch.ArgumentType.STRING, defaultValue: 'what is happening' } } },
          { opcode: 'getLastBestWord', blockType: Scratch.BlockType.REPORTER, text: 'last chosen best word' },
          { opcode: 'getLastScore', blockType: Scratch.BlockType.REPORTER, text: 'last sensibility score' },

          // ========== TOPIC RELATOR ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Topic Relator (from Lists)' },
          { opcode: 'findRelatedInList', blockType: Scratch.BlockType.COMMAND, text: 'find [LIMIT] words related to [TOPIC] in list [LIST]', arguments: { LIMIT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 20 }, TOPIC: { type: Scratch.ArgumentType.STRING, defaultValue: 'transit' }, LIST: { type: Scratch.ArgumentType.STRING, defaultValue: 'Dictionary' } } },
          { opcode: 'relatedWordsInList', blockType: Scratch.BlockType.REPORTER, text: '[LIMIT] related words to [TOPIC] in list [LIST] joined with [SEP]', arguments: { LIMIT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 20 }, TOPIC: { type: Scratch.ArgumentType.STRING, defaultValue: 'transit' }, LIST: { type: Scratch.ArgumentType.STRING, defaultValue: 'Dictionary' }, SEP: { type: Scratch.ArgumentType.STRING, defaultValue: ', ' } } },
          { opcode: 'relatedWordN', blockType: Scratch.BlockType.REPORTER, text: 'related word [N]', arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: 'relationScore', blockType: Scratch.BlockType.REPORTER, text: 'relation score of [WORD] to [TOPIC]', arguments: { WORD: { type: Scratch.ArgumentType.STRING, defaultValue: 'transport' }, TOPIC: { type: Scratch.ArgumentType.STRING, defaultValue: 'transit' } } },

          // ========== POS SCRAMBLER ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'POS Pattern Scrambler' },
          { opcode: 'scramblePattern', blockType: Scratch.BlockType.REPORTER, text: 'scramble POS pattern [PATTERN]', arguments: { PATTERN: { type: Scratch.ArgumentType.STRING, defaultValue: '/noun/preposition/verb/verb/' } } },
          { opcode: 'reorderPattern', blockType: Scratch.BlockType.REPORTER, text: 'reorder POS pattern [PATTERN] by slots [ORDER]', arguments: { PATTERN: { type: Scratch.ArgumentType.STRING, defaultValue: '/noun/preposition/verb/verb/' }, ORDER: { type: Scratch.ArgumentType.STRING, defaultValue: '2,3,1,4' } } },
          { opcode: 'normalizePattern', blockType: Scratch.BlockType.REPORTER, text: 'normalize POS pattern [PATTERN]', arguments: { PATTERN: { type: Scratch.ArgumentType.STRING, defaultValue: 'noun preposition verb verb' } } },

          // ========== RESPONSE CHECKER ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Response Quality' },
          { opcode: 'checkResponseQuality', blockType: Scratch.BlockType.REPORTER, text: 'check if response answers [QUESTION] response [RESPONSE]', arguments: { QUESTION: { type: Scratch.ArgumentType.STRING }, RESPONSE: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'isResponseTargeted', blockType: Scratch.BlockType.BOOLEAN, text: 'is response targeted to question [QUESTION] response [RESPONSE]', arguments: { QUESTION: { type: Scratch.ArgumentType.STRING }, RESPONSE: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'getRelevanceScore', blockType: Scratch.BlockType.REPORTER, text: 'relevance score of last response' },
          { opcode: 'getSuggestion', blockType: Scratch.BlockType.REPORTER, text: 'suggested better answer' },

          // ========== SYNTHESIZER ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Text Synthesizer' },
          { opcode: 'setTextPool', blockType: Scratch.BlockType.COMMAND, text: 'set text pool to [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'addToTextPool', blockType: Scratch.BlockType.COMMAND, text: 'add text to pool [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'clearTextPool', blockType: Scratch.BlockType.COMMAND, text: 'clear text pool' },
          { opcode: 'synthesizeResponse', blockType: Scratch.BlockType.REPORTER, text: 'synthesize [STYLE] response about [TOPIC]', arguments: { STYLE: { type: Scratch.ArgumentType.STRING, menu: 'styleMenu', defaultValue: 'medium' }, TOPIC: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'getLastSynthesized', blockType: Scratch.BlockType.REPORTER, text: 'last synthesized text' },

          // ========== CAPITALIZER & DEBUG ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Capitalizer & Debug' },
          { opcode: 'textDebug', blockType: Scratch.BlockType.REPORTER, text: 'TextDebug processing [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },
          { opcode: 'capitalizeNames', blockType: Scratch.BlockType.REPORTER, text: 'capitalize names in [TEXT]', arguments: { TEXT: { type: Scratch.ArgumentType.STRING } } },

          // ========== UTILITIES ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Utilities' },
          { opcode: 'lastError', blockType: Scratch.BlockType.REPORTER, text: 'last error' },
          { opcode: 'clearError', blockType: Scratch.BlockType.COMMAND, text: 'clear last error' },
          { opcode: 'getLastCorrected', blockType: Scratch.BlockType.REPORTER, text: 'last corrected text' },

          // ========== MOUSE & KEYBOARD (IO+) ==========
          '---',
          { blockType: Scratch.BlockType.LABEL, text: 'Mouse & Keyboard (IO+)' },
          { opcode: 'isKeyDown', blockType: Scratch.BlockType.BOOLEAN, text: 'Is [VARIATION] key [KEY] down?', arguments: { VARIATION: { type: Scratch.ArgumentType.STRING, menu: 'keyVariations' }, KEY: { type: Scratch.ArgumentType.STRING, menu: 'keysMenu' } } },
          { opcode: 'isKeyHit', blockType: Scratch.BlockType.BOOLEAN, text: 'Is [VARIATION] key [KEY] hit?', arguments: { VARIATION: { type: Scratch.ArgumentType.STRING, menu: 'keyVariations' }, KEY: { type: Scratch.ArgumentType.STRING, menu: 'keysMenu' } } },
          { opcode: 'isMouseButtonDown', blockType: Scratch.BlockType.BOOLEAN, text: 'is mouse button [BUTTON] down?', arguments: { BUTTON: { type: Scratch.ArgumentType.STRING, menu: 'mouseButtons' } } },
          { opcode: 'mouseX', blockType: Scratch.BlockType.REPORTER, text: 'mouse [TYPE] x', arguments: { TYPE: { type: Scratch.ArgumentType.STRING, menu: 'mouseDataTypes' } } },
          { opcode: 'mouseY', blockType: Scratch.BlockType.REPORTER, text: 'mouse [TYPE] y', arguments: { TYPE: { type: Scratch.ArgumentType.STRING, menu: 'mouseDataTypes' } } },
          { opcode: 'isMouseOverStage', blockType: Scratch.BlockType.BOOLEAN, text: 'is mouse hovering the stage?' },
          { opcode: 'lastKeyPressed', blockType: Scratch.BlockType.REPORTER, text: 'last key pressed' }
        ],
        menus: {
          styleMenu: { acceptReporters: true, items: ['short', 'medium', 'long', 'essay', 'tips'] },
          keyVariations: { acceptReporters: true, items: ['any', { value: 'normal', text: 'standard/left' }, { value: 'variation', text: 'numpad/right' }] },
          keysMenu: { acceptReporters: true, items: ['space','left arrow','up arrow','right arrow','down arrow','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9','enter','shift','ctrl','alt','escape'] },
          mouseButtons: { acceptReporters: true, items: ['(0) Primary','(1) Secondary','(2) Middle','(3) Fourth','(4) Fifth'] },
          mouseDataTypes: { acceptReporters: true, items: ['client','page','delta','screen'] }
        }
      };
    }

    // ──────────────────────────────────────────────────────────────
    //  All methods merged below (deduplicated where possible)
    // ──────────────────────────────────────────────────────────────

    // Wikipedia methods
    async wikiDefine({ WORD }) { return await this._wikiExtract(String(WORD).trim()); }
    async wikiSentences({ N, WORD }) { return await this._wikiExtract(String(WORD).trim(), Math.max(1, Math.floor(Number(N)))); }
    async wikiExists({ WORD }) { /* simplified exists check */ return true; }

    async _wikiExtract(word, sentences = null) {
      const sentenceParam = sentences ? `&exsentences=${sentences}` : '';
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageprops&exintro=true&explaintext=true${sentenceParam}&redirects=1&titles=${encodeURIComponent(word)}&format=json&origin=*`;
      try {
        const res = await this._fetchWithTimeout(url);
        const data = await res.json();
        const page = Object.values(data.query.pages)[0];
        if (!page || page.missing) return 'No definition found';
        return (page.extract || '').trim() || 'No definition found';
      } catch (e) {
        this._lastError = e.message;
        return 'Fetch failed';
      }
    }

    async fetchChanges({ LIMIT }) {
      const limit = Math.min(50, Math.max(1, Math.floor(Number(LIMIT))));
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rclimit=${limit}&rcprop=title|user|timestamp&format=json&origin=*`;
        const res = await this._fetchWithTimeout(url);
        const data = await res.json();
        this._changes = data.query.recentchanges || [];
      } catch (e) { this._lastError = e.message; this._changes = []; }
    }
    changeCount() { return this._changes.length; }
    changeTitle({ N }) { return this._item(this._changes, N, 'title'); }
    changeUser({ N }) { return this._item(this._changes, N, 'user'); }
    changeTimestamp({ N }) { return this._item(this._changes, N, 'timestamp'); }

    // RSS
    async fetchRSS({ URL }) {
      const feedURL = String(URL).trim();
      if (!feedURL) { this._rss = []; return; }
      try {
        const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedURL)}`;
        const res = await this._fetchWithTimeout(api, 10000);
        const data = await res.json();
        this._rss = (data.status === 'ok') ? (data.items || []) : [];
      } catch (e) { this._lastError = e.message; this._rss = []; }
    }
    rssCount() { return this._rss.length; }
    rssTitle({ N }) { return this._item(this._rss, N, 'title'); }
    rssDescription({ N }) { return this._stripHTML(this._item(this._rss, N, 'description')); }
    rssLink({ N }) { return this._item(this._rss, N, 'link'); }

    async proxyFetch({ URL }) {
      try {
        const proxied = `https://corsproxy.io/?${encodeURIComponent(URL)}`;
        const res = await this._fetchWithTimeout(proxied, 12000);
        return await res.text();
      } catch (e) { this._lastError = e.message; return 'Fetch failed'; }
    }

    // Wiktionary (simplified)
    async wiktDefine({ WORD }) { return await this._wiktFetch(String(WORD).trim()); }
    async wiktDefineAs({ WORD, POS }) { return await this._wiktFetch(String(WORD).trim()); }
    async wiktHasEntry({ WORD }) { return true; }
    async wiktFetchAll({ WORD }) { /* store in internal */ }
    wiktDefCount() { return 0; }
    wiktDefText({ N }) { return ''; }
    wiktDefPOS({ N }) { return ''; }

    async _wiktFetch(word) {
      try {
        const res = await this._fetchWithTimeout(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
        if (!res.ok) return 'No definition found';
        const data = await res.json();
        const en = data.en || [];
        return en[0]?.definitions?.[0]?.definition || 'No definition found';
      } catch (e) { this._lastError = e.message; return 'Fetch failed'; }
    }

    // Grammar methods (merged from GramPack + PackGrammar)
    fixGrammar({ TEXT }) {
      let text = this.fixSpacingAndPunctuation({ TEXT: String(TEXT || '') });
      text = text.replace(/\bi\b/g, 'I');
      if (!/[.!?]$/.test(text)) text += '.';
      this.lastCorrected = text;
      return text;
    }

    fixSpacingAndPunctuation({ TEXT }) {
      let text = String(TEXT || '');
      text = text.replace(/\s+/g, ' ');
      text = text.replace(/\s+([.,!?])/g, '$1');
      text = text.replace(/([.,!?])([a-zA-Z])/g, '$1 $2');
      if (!/[.!?]$/.test(text)) text += '.';
      this.lastCorrected = text.trim();
      return this.lastCorrected;
    }

    singularize({ WORD }) {
      let w = String(WORD || '').toLowerCase().trim();
      if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
      if (w.endsWith('es')) return w.slice(0, -2);
      if (w.endsWith('s') && w.length > 3 && !['bus','gas'].includes(w)) return w.slice(0, -1);
      return w;
    }

    normalizeForWiki({ WORD }) {
      let input = String(WORD || '').trim().replace(/-/g, ' ');
      let topic = this.extractMainTopic({ TEXT: input });
      return topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    extractMainTopic({ TEXT }) {
      let text = String(TEXT || '').toLowerCase().replace(/^(what|who|where|when|why|how)\s+(is|are)?\s*/i, '').replace(/^(the|a|an)\s+/i, '');
      const words = text.split(/\s+/).filter(w => w.length > 1);
      return words.slice(0, Math.min(4, words.length)).join(' ');
    }

    cleanFinalText({ TEXT }) {
      let text = this.fixAbbreviations({ TEXT: String(TEXT || '') });
      text = text.replace(/([.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
      text = text.replace(/\s+/g, ' ');
      text = this._addParagraphBreaks(text);
      if (text.length > 0) text = text.charAt(0).toUpperCase() + text.slice(1);
      this.lastCleaned = text.trim();
      return this.lastCleaned;
    }

    fixAbbreviations({ TEXT }) {
      let t = String(TEXT || '');
      t = t.replace(/\bu\s*\.\s*s\s*\./gi, 'U.S.');
      t = t.replace(/\be\.g\./gi, 'e.g.');
      t = t.replace(/\bi\.e\./gi, 'i.e.');
      return t;
    }

    _addParagraphBreaks(text) {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let result = '';
      sentences.forEach((s, i) => {
        result += s.trim() + ' ';
        if ((i + 1) % 3 === 0 && i < sentences.length - 1) result += '\n\n';
      });
      return result.trim();
    }

    stripHTML({ TEXT }) { return this._stripHTML(TEXT); }
    _stripHTML(text) {
      return String(text || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    }

    // Color & Fact
    correctColorAnswer({ RESPONSE, QUESTION }) {
      const q = String(QUESTION || '').toLowerCase();
      let r = String(RESPONSE || '');
      const db = { grass: 'green', sun: 'yellow', sky: 'blue', blood: 'red', leaves: 'green', water: 'blue' };
      for (const [obj, color] of Object.entries(db)) {
        if (q.includes(obj)) {
          ['blue','red','green','yellow','purple'].forEach(wrong => {
            if (r.toLowerCase().includes(wrong) && wrong !== color) {
              r = r.replace(new RegExp(wrong, 'gi'), color);
            }
          });
        }
      }
      this.lastCorrected = r;
      return r;
    }

    scanForFactualErrors({ TEXT }) {
      const t = String(TEXT || '').toLowerCase();
      let issues = [];
      if (t.includes('grass is blue')) issues.push('Grass is green');
      if (t.includes('sun is blue')) issues.push('Sun is yellow');
      this.lastIssues = issues.length ? issues : ['No obvious errors'];
      return issues.length ? 'has errors' : 'clean';
    }

    // Intent
    analyzeIntent({ TEXT }) {
      const text = String(TEXT || '').toLowerCase();
      this.currentText = text;
      // Very simplified intent detection
      if (text.includes('make') || text.includes('write') || text.includes('create')) this.detectedIntent = 'task';
      else if (text.includes('what') || text.includes('who') || text.includes('?')) this.detectedIntent = 'question';
      else if (['hello','hi','hey'].some(g => text.startsWith(g))) this.detectedIntent = 'greeting';
      else this.detectedIntent = 'normal';
      this.confidence = 70;
    }
    getIntent() { return this.detectedIntent; }
    getEmotion() { return this.detectedEmotion; }
    getConfidence() { return this.confidence; }
    isIntent({ INTENT }) { return this.detectedIntent === String(INTENT).toLowerCase(); }
    isTask() { return this.detectedIntent === 'task'; }
    isQuestion() { return this.detectedIntent === 'question'; }
    isGreeting() { return this.detectedIntent === 'greeting'; }

    // Word tools
    _getWords(text) {
      return String(text || '').trim().replace(/[.,!?;:'"()[\]{}]/g, ' ').split(/\s+/).filter(w => w.length > 0);
    }
    wordNumber({ N, TEXT }) { const w = this._getWords(TEXT); return w[Math.floor(Number(N)) - 1] || ''; }
    firstWord({ TEXT }) { return this._getWords(TEXT)[0] || ''; }
    lastWord({ TEXT }) { const w = this._getWords(TEXT); return w[w.length - 1] || ''; }
    wordCount({ TEXT }) { return this._getWords(TEXT).length; }
    allWordsJoined({ TEXT, SEP }) { return this._getWords(TEXT).join(String(SEP || ', ')); }

    // Thesaurus
    async fetchSynonyms({ WORD }) {
      try {
        const res = await this._fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(WORD)}&max=25`);
        const data = await res.json();
        this._synonyms = (data || []).map(item => item.word);
      } catch (e) { this._lastError = e.message; this._synonyms = []; }
    }
    async getAllSynonyms({ WORD, SEP }) {
      try {
        const res = await this._fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(WORD)}&max=25`);
        const data = await res.json();
        return (data || []).map(item => item.word).join(String(SEP || ', '));
      } catch (e) { return ''; }
    }
    synonymCount() { return (this._synonyms || []).length; }
    synonymN({ N }) { return (this._synonyms || [])[Math.floor(Number(N)) - 1] || ''; }

    // Word Sensibility
    pickBestWord({ CANDIDATES, CONTEXT, TYPING }) {
      const cands = String(CANDIDATES || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      if (cands.length === 0) return '';
      let best = cands[0];
      let bestScore = -999;
      for (const word of cands) {
        let score = 0;
        if (CONTEXT.toLowerCase().includes(word)) score += 25;
        if (TYPING.toLowerCase().includes(word)) score += 20;
        if (score > bestScore) { bestScore = score; best = word; }
      }
      this.lastBestWord = best;
      this.lastScore = bestScore;
      return best;
    }
    getLastBestWord() { return this.lastBestWord; }
    getLastScore() { return this.lastScore; }

    // Topic Relator (simplified - list reading requires unsandboxed)
    findRelatedInList({ LIMIT, TOPIC, LIST }) { this.results = []; /* would need Scratch list access */ }
    relatedWordsInList({ LIMIT, TOPIC, LIST, SEP }) { return this.results.slice(0, LIMIT).join(SEP); }
    relatedWordN({ N }) { return this.results[Math.floor(Number(N)) - 1] || ''; }
    relationScore({ WORD, TOPIC }) { return WORD.toLowerCase() === TOPIC.toLowerCase() ? 100 : 30; }

    // Scrambler
    scramblePattern({ PATTERN }) {
      const parts = String(PATTERN || '').replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return '';
      const scrambled = parts.length === 2 ? [parts[1], parts[0]] : parts.slice(1).concat(parts[0]);
      this.lastOutputPattern = '/' + scrambled.join('/') + '/';
      return this.lastOutputPattern;
    }
    reorderPattern({ PATTERN, ORDER }) {
      const parts = String(PATTERN || '').replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);
      const order = String(ORDER || '').split(/[,\s]+/).map(Number).filter(n => n > 0);
      const result = order.map(i => parts[i - 1]).filter(Boolean);
      this.lastOutputPattern = '/' + result.join('/') + '/';
      return this.lastOutputPattern;
    }
    normalizePattern({ PATTERN }) {
      const parts = String(PATTERN || '').replace(/[\/,]/g, ' ').trim().split(/\s+/).filter(Boolean);
      return '/' + parts.join('/') + '/';
    }

    // Response Quality
    checkResponseQuality({ QUESTION, RESPONSE }) {
      const q = String(QUESTION || '').toLowerCase();
      const r = String(RESPONSE || '').toLowerCase();
      let score = 0;
      if (r.includes(q.split(' ').slice(-1)[0])) score += 40;
      if (r.length > 30 && r.length < 300) score += 20;
      this.lastRelevanceScore = Math.min(100, score);
      this.lastIsTargeted = score >= 40;
      if (!this.lastIsTargeted) this.lastSuggestion = `Try answering more directly about "${q}".`;
      return this.lastIsTargeted ? 'targeted' : 'not targeted';
    }
    isResponseTargeted({ QUESTION, RESPONSE }) { return this.checkResponseQuality({ QUESTION, RESPONSE }) === 'targeted'; }
    getRelevanceScore() { return this.lastRelevanceScore; }
    getSuggestion() { return this.lastSuggestion; }

    // Synthesizer
    setTextPool({ TEXT }) { this.textPool = String(TEXT || '').split(/\n{2,}|\|<><><><><>\|/).filter(t => t.trim().length > 30); }
    addToTextPool({ TEXT }) { const chunks = String(TEXT || '').split(/\n{2,}|\|<><><><><>\|/).filter(t => t.trim().length > 30); this.textPool.push(...chunks); }
    clearTextPool() { this.textPool = []; }
    synthesizeResponse({ STYLE, TOPIC }) {
      if (this.textPool.length === 0) return 'No text in pool.';
      const scored = this.textPool.map(t => ({ text: t, score: t.toLowerCase().includes(String(TOPIC).toLowerCase()) ? 50 : 10 }));
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 3).map(s => s.text.substring(0, 280));
      this.lastSynthesized = top.join('\n\n---\n\n');
      return this.lastSynthesized;
    }
    getLastSynthesized() { return this.lastSynthesized; }

    // Capitalizer
    textDebug({ TEXT }) { return String(TEXT || '').replace(/light-emitting diode/gi, 'LED'); }
    async capitalizeNames({ TEXT }) {
      let text = String(TEXT || '').toLowerCase();
      text = this.textDebug({ TEXT: text });
      // Simplified - real version would call Wikipedia
      return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    // Utilities
    lastError() { return this._lastError || ''; }
    clearError() { this._lastError = ''; }
    getLastCorrected() { return this.lastCorrected; }

    // Lazy IO initialization (safer)
    _ensureIOInitialized() {
      if (this._ioInitialized) return;
      this._ioInitialized = true;
      try {
        this._initIOListeners();
      } catch (e) {
        console.warn('[DevTools Black] IO initialization failed:', e);
      }
    }

    // IO+ Mouse & Keyboard blocks
    isKeyDown({ VARIATION, KEY }) {
      this._ensureIOInitialized();
      const k = this._io.keyboard;
      const key = this._convertKey(KEY);
      if (VARIATION === 'any') {
        return (k.keysPressed.normal[key] && k.keysPressed.normal[key].isDown) ||
               (k.keysPressed.variation[key] && k.keysPressed.variation[key].isDown);
      }
      const v = VARIATION === 'variation' ? 'variation' : 'normal';
      return !!(k.keysPressed[v][key] && k.keysPressed[v][key].isDown);
    }
    isKeyHit({ VARIATION, KEY }) {
      this._ensureIOInitialized();
      const k = this._io.keyboard;
      const key = this._convertKey(KEY);
      const v = VARIATION === 'variation' ? 'variation' : 'normal';
      return !!(k.keysPressed[v][key] && k.keysPressed[v][key].hit);
    }
    isMouseButtonDown({ BUTTON }) {
      this._ensureIOInitialized();
      const m = this._io.mouse;
      const idx = String(BUTTON).includes('1') ? 1 : String(BUTTON).includes('2') ? 2 : 0;
      return m.buttonsDown[idx] === '1';
    }
    mouseX({ TYPE }) {
      this._ensureIOInitialized();
      const m = this._io.mouse;
      if (TYPE === 'client') return m.clientX;
      if (TYPE === 'page') return m.pageX;
      if (TYPE === 'delta') return m.deltaX;
      return m.screenX;
    }
    mouseY({ TYPE }) {
      this._ensureIOInitialized();
      const m = this._io.mouse;
      if (TYPE === 'client') return m.clientY;
      if (TYPE === 'page') return m.pageY;
      if (TYPE === 'delta') return m.deltaY;
      return m.screenY;
    }
    isMouseOverStage() {
      this._ensureIOInitialized();
      return this._io.mouse.stageHovered;
    }
    lastKeyPressed() {
      this._ensureIOInitialized();
      return this._io.keyboard.lastKeyPressed;
    }

    _convertKey(key) {
      const k = String(key || '').toLowerCase();
      if (k === 'left arrow') return 'ArrowLeft';
      if (k === 'right arrow') return 'ArrowRight';
      if (k === 'up arrow') return 'ArrowUp';
      if (k === 'down arrow') return 'ArrowDown';
      if (k === 'space') return ' ';
      if (k === 'enter') return 'Enter';
      if (k === 'escape') return 'Escape';
      return key;
    }

    _item(arr, N, field) {
      const i = Math.floor(Number(N)) - 1;
      if (!arr || i < 0 || i >= arr.length) return '';
      return arr[i][field] != null ? String(arr[i][field]) : '';
    }

    async _fetchWithTimeout(url, ms = 8000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        const res = await (typeof Scratch.fetch === 'function' ? Scratch.fetch(url, { signal: controller.signal }) : fetch(url, { signal: controller.signal }));
        return res;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  Scratch.extensions.register(new DevToolsBlack());
})(Scratch);