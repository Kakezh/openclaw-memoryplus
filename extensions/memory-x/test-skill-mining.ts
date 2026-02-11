
import memoryXPlugin from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_WORKSPACE = path.join(__dirname, '../../test-workspace-latex');

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
  pluginConfig: {
      // Set lower threshold for testing
      skills: {
          minThemeFrequency: 3
      }
  },
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
  sessionKey: 'latex-session',
});

// Helper to find tool by name
const getTool = (name: string) => tools.find((t: any) => t.name === name);

async function runTest() {
  console.log('\n🚀 Starting LaTeX Skill Mining Test\n');

  // 1. Simulate Interactions (Ingest)
  console.log('--- 1. Simulating User Interactions ---');
  const remember = getTool('memory_remember');
  
  // A series of interactions that strongly imply a "LaTeX Academic Writing" theme
  const interactions = [
    { content: "When writing the paper, use the 'article' class with 12pt font.", entities: ["LaTeX", "Academic Writing"] },
    { content: "Always use the 'graphicx' package for including figures in the paper.", entities: ["LaTeX", "Figures"] },
    { content: "References must be in BibTeX format using the 'plainnat' style.", entities: ["LaTeX", "BibTeX"] },
    { content: "Ensure all equations are numbered using the 'equation' environment.", entities: ["LaTeX", "Equations"] },
    { content: "Abstract should be no more than 200 words and placed before the introduction.", entities: ["Academic Writing", "Abstract"] }
  ];

  for (const item of interactions) {
    await remember.execute('call-id', { 
        content: item.content, 
        type: 'fact', 
        confidence: 0.95, 
        entities: item.entities 
    });
  }
  console.log(`✅ Stored ${interactions.length} memories related to LaTeX writing.`);

  // 2. Reflect (Mining)
  console.log('\n--- 2. Reflecting to Mine Skills ---');
  const reflect = getTool('memory_reflect');
  const reflectResult = await reflect.execute('call-id', { focus: 'skills' });
  
  const patterns = reflectResult.details.patterns || [];
  console.log(`✅ Found ${patterns.length} patterns.`);
  
  const latexPattern = patterns.find(p => p.themeName.includes("LaTeX") || p.themeName.includes("Academic"));
  
  if (latexPattern) {
      console.log('   🎯 Target Pattern Found:', JSON.stringify(latexPattern, null, 2));
      
      // 3. Evolve (Solidify SOP)
      console.log('\n--- 3. Solidifying into SOP (Evolve) ---');
      const evolve = getTool('memory_evolve');
      
      // Constructing the SOP content based on the mined context
      const sopContent = `
**Goal**: Standardize academic paper writing in LaTeX.
**Steps**:
${latexPattern.context.map((ctx: string, i: number) => `${i+1}. ${ctx}`).join('\n')}
`;
      
      const evolveResult = await evolve.execute('call-id', {
          action: 'add_sop',
          content: sopContent,
          reason: `High frequency usage of ${latexPattern.themeName} detected (${latexPattern.occurrenceCount} times).`
      });
      
      if (evolveResult.details.success) {
          console.log('✅ Successfully wrote SOP to META.md');
          const metaPath = path.join(TEST_WORKSPACE, 'memory', 'META.md');
          if (fs.existsSync(metaPath)) {
              console.log('\n📄 META.md Content Preview:\n' + fs.readFileSync(metaPath, 'utf-8'));
          }
      }
  } else {
      console.warn('⚠️ LaTeX pattern not found. Check theme generation logic.');
  }
  
  console.log('\n🎉 Test Complete!');
}

runTest().catch(console.error);
