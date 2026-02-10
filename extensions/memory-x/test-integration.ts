
import memoryXPlugin from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_WORKSPACE = path.join(__dirname, '../../test-workspace');

// Clean previous test run
if (fs.existsSync(TEST_WORKSPACE)) {
  fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
}
fs.mkdirSync(TEST_WORKSPACE, { recursive: true });

console.log(`📂 Test Workspace: ${TEST_WORKSPACE}`);

// Mock Plugin API
const mockApi = {
  logger: {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
  },
  pluginConfig: {},
  registerTool: (factory: any) => {
    mockApi.toolFactory = factory;
  },
  toolFactory: null as any,
};

// Register Plugin
memoryXPlugin.register(mockApi as any);

// Initialize Tools
const tools = await mockApi.toolFactory({
  workspaceDir: TEST_WORKSPACE,
  sessionKey: 'test-session',
});

// Helper to find tool by name
const getTool = (name: string) => tools.find((t: any) => t.name === name);

async function runTest() {
  console.log('\n🚀 Starting Memory-X Integration Test\n');

  // 1. Test Remember (Ingest)
  console.log('--- 1. Testing memory_remember ---');
  const remember = getTool('memory_remember');
  
  // Simulate user repeatedly correcting SQL syntax to trigger a pattern
  const memories = [
    "Please use PostgreSQL syntax, not MySQL.",
    "Again, use Postgres syntax for the query.",
    "I prefer PostgreSQL for all database operations.",
    "Remember to use valid PostgreSQL SQL.",
    "Stop using MySQL specific functions, stick to Postgres.",
    "My production DB is Postgres."
  ];

  for (const content of memories) {
    await remember.execute('call-id', { content, type: 'preference', confidence: 0.9, entities: ['PostgreSQL'] });
  }
  console.log('✅ Stored 6 memories about PostgreSQL preference.');

  // Verify file creation
  const today = new Date().toISOString().split('T')[0];
  const logPath = path.join(TEST_WORKSPACE, 'memory', `${today}.md`);
  if (fs.existsSync(logPath)) {
      console.log(`✅ Canonical log created at: ${logPath}`);
      console.log('   Content preview:', fs.readFileSync(logPath, 'utf-8').slice(0, 100).replace(/\n/g, '\\n') + '...');
  } else {
      console.error('❌ Canonical log missing!');
  }

  // 2. Test Recall (Retrieve)
  console.log('\n--- 2. Testing memory_recall ---');
  const recall = getTool('memory_recall');
  const recallResult = await recall.execute('call-id', { query: 'postgres preference' });
  const evidence = recallResult.details.evidence;
  console.log(`✅ Recalled ${evidence.semantics.length} semantics and ${evidence.themes.length} themes.`);
  if (evidence.semantics.length > 0) {
      console.log(`   Sample: "${evidence.semantics[0].content}"`);
  }

  // 3. Test Reflect (Mining)
  console.log('\n--- 3. Testing memory_reflect (Evolution Mining) ---');
  const reflect = getTool('memory_reflect');
  const reflectResult = await reflect.execute('call-id', { focus: 'evolution' });
  
  const suggestions = reflectResult.details.evolutionSuggestions || [];
  console.log(`✅ Found ${suggestions.length} evolution suggestions.`);
  
  if (suggestions.length > 0) {
      console.log('   Suggestion:', JSON.stringify(suggestions[0], null, 2));
      
      // 4. Test Evolve (Adapt)
      console.log('\n--- 4. Testing memory_evolve (Self-Evolution) ---');
      const evolve = getTool('memory_evolve');
      const suggestion = suggestions[0];
      
      // Assume the agent accepts the suggestion
      if (suggestion.type === 'prompt_update') {
          const evolveResult = await evolve.execute('call-id', {
              action: 'add_rule',
              content: "Always use PostgreSQL syntax for database queries.",
              reason: suggestion.reason
          });
          
          if (evolveResult.details.success) {
              console.log('✅ Successfully evolved META.md');
              const metaPath = path.join(TEST_WORKSPACE, 'memory', 'META.md');
              if (fs.existsSync(metaPath)) {
                  console.log('   META.md content:\n' + fs.readFileSync(metaPath, 'utf-8'));
              } else {
                  console.error('❌ META.md missing!');
              }
          }
      }
  } else {
      console.warn('⚠️ No evolution suggestions found. Check frequency threshold in logic.');
  }
  
  console.log('\n🎉 Test Complete!');
}

runTest().catch(console.error);
