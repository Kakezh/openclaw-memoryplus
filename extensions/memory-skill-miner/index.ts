/**
 * Skill Miner Plugin
 * Automatic skill discovery and generation from conversation patterns
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { SkillMiner } from "./miner.js";
import type { SkillMinerConfig, PotentialSkill } from "./types.js";

// Default configuration
const DEFAULT_CONFIG: SkillMinerConfig = {
  enabled: true,
  minOccurrences: 3,
  similarityThreshold: 0.8,
  observationWindow: 7,
  autoGenerate: false,
  autoEvolve: true,
  integration: {
    useMemory: true,
    saveOutcomes: true,
    learnFromFailures: true,
  },
};

const configSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  minOccurrences: Type.Number({ default: 3 }),
  similarityThreshold: Type.Number({ default: 0.8 }),
  observationWindow: Type.Number({ default: 7 }),
  autoGenerate: Type.Boolean({ default: false }),
  autoEvolve: Type.Boolean({ default: true }),
  integration: Type.Object({
    useMemory: Type.Boolean({ default: true }),
    saveOutcomes: Type.Boolean({ default: true }),
    learnFromFailures: Type.Boolean({ default: true }),
  }),
});

// In-memory storage for discovered skills
const discoveredSkills: Map<string, PotentialSkill> = new Map();

const skillMinerPlugin = {
  id: "memory-skill-miner",
  name: "Skill Miner",
  description: "Automatic skill discovery and generation from conversation patterns",
  kind: "memory",
  configSchema,

  register(api: OpenClawPluginApi) {
    const logger = api.runtime.logging.getSubsystemLogger("skill-miner");

    api.registerTool(
      (ctx) => {
        const config: SkillMinerConfig = {
          ...DEFAULT_CONFIG,
          ...ctx.config,
        };

        const sessionsDir = `${ctx.workspacePath}/../agents/${ctx.agentId || "main"}/sessions`;
        const miner = new SkillMiner(config, sessionsDir);

        // Tool: Scan for potential skills
        const scanTool = api.runtime.tools.defineTool({
          name: "skill_mine",
          description: "Scan session logs to discover potential skills",
          parameters: Type.Object({
            sinceDays: Type.Optional(Type.Number({ default: 7 })),
          }),
          returns: Type.Object({
            skills: Type.Array(Type.Object({
              id: Type.String(),
              name: Type.String(),
              description: Type.String(),
              occurrenceCount: Type.Number(),
              confidence: Type.Number(),
              triggerPatterns: Type.Array(Type.String()),
              toolsUsed: Type.Array(Type.String()),
            })),
            totalScanned: Type.Number(),
          }),
          async execute({ sinceDays = 7 }) {
            try {
              const skills = await miner.scan(sinceDays);
              
              // Store discovered skills
              for (const skill of skills) {
                discoveredSkills.set(skill.id, skill);
              }

              logger.info(`Discovered ${skills.length} potential skills`);

              return {
                skills: skills.map((s) => ({
                  id: s.id,
                  name: s.name,
                  description: s.description,
                  occurrenceCount: s.occurrenceCount,
                  confidence: s.confidence,
                  triggerPatterns: s.triggerPatterns,
                  toolsUsed: s.toolsUsed,
                })),
                totalScanned: skills.length,
              };
            } catch (error) {
              logger.error("Failed to scan for skills:", error);
              throw error;
            }
          },
        });

        // Tool: Generate skill from potential skill
        const generateTool = api.runtime.tools.defineTool({
          name: "skill_generate",
          description: "Generate a SKILL.md file from a discovered potential skill",
          parameters: Type.Object({
            potentialSkillId: Type.String(),
            targetPath: Type.Optional(Type.String()),
          }),
          returns: Type.Object({
            success: Type.Boolean(),
            filePath: Type.Optional(Type.String()),
            content: Type.String(),
          }),
          async execute({ potentialSkillId, targetPath }) {
            const skill = discoveredSkills.get(potentialSkillId);
            if (!skill) {
              throw new Error(`Potential skill not found: ${potentialSkillId}`);
            }

            // Generate SKILL.md content
            const content = generateSkillMd(skill);
            
            // Determine target path
            const skillsDir = targetPath || `${ctx.workspacePath}/../skills/${skill.name}`;
            const filePath = `${skillsDir}/SKILL.md`;

            try {
              const fs = await import("node:fs/promises");
              await fs.mkdir(skillsDir, { recursive: true });
              await fs.writeFile(filePath, content, "utf-8");
              
              skill.status = "generated";
              logger.info(`Generated skill: ${filePath}`);

              return {
                success: true,
                filePath,
                content,
              };
            } catch (error) {
              logger.error("Failed to generate skill:", error);
              throw error;
            }
          },
        });

        // Tool: Preview skill generation
        const previewTool = api.runtime.tools.defineTool({
          name: "skill_preview",
          description: "Preview the SKILL.md that would be generated",
          parameters: Type.Object({
            potentialSkillId: Type.String(),
          }),
          returns: Type.Object({
            content: Type.String(),
          }),
          async execute({ potentialSkillId }) {
            const skill = discoveredSkills.get(potentialSkillId);
            if (!skill) {
              throw new Error(`Potential skill not found: ${potentialSkillId}`);
            }

            const content = generateSkillMd(skill);
            return { content };
          },
        });

        // Tool: List discovered skills
        const listTool = api.runtime.tools.defineTool({
          name: "skill_list_discovered",
          description: "List all discovered potential skills",
          parameters: Type.Object({}),
          returns: Type.Object({
            skills: Type.Array(Type.Object({
              id: Type.String(),
              name: Type.String(),
              description: Type.String(),
              status: Type.String(),
              occurrenceCount: Type.Number(),
              confidence: Type.Number(),
            })),
          }),
          async execute() {
            const skills = Array.from(discoveredSkills.values());
            return {
              skills: skills.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                status: s.status,
                occurrenceCount: s.occurrenceCount,
                confidence: s.confidence,
              })),
            };
          },
        });

        // Tool: Approve/reject potential skill
        const reviewTool = api.runtime.tools.defineTool({
          name: "skill_review",
          description: "Approve or reject a discovered potential skill",
          parameters: Type.Object({
            potentialSkillId: Type.String(),
            action: Type.Enum({ approve: "approve", reject: "reject" }),
          }),
          returns: Type.Object({ success: Type.Boolean() }),
          async execute({ potentialSkillId, action }) {
            const skill = discoveredSkills.get(potentialSkillId);
            if (!skill) {
              throw new Error(`Potential skill not found: ${potentialSkillId}`);
            }

            skill.status = action === "approve" ? "approved" : "rejected";
            return { success: true };
          },
        });

        return [scanTool, generateTool, previewTool, listTool, reviewTool];
      },
      { names: ["skill_mine", "skill_generate", "skill_preview", "skill_list_discovered", "skill_review"] }
    );

    // Register CLI
    api.registerCli(
      ({ program }) => {
        const minerCmd = program
          .command("skill-miner")
          .description("Skill discovery and generation");

        minerCmd
          .command("scan")
          .description("Scan sessions for potential skills")
          .option("-d, --days <days>", "Days to look back", "7")
          .action(async (options: { days: string }) => {
            const workspacePath = api.runtime.config.getWorkspacePath();
            const config = DEFAULT_CONFIG;
            const sessionsDir = `${workspacePath}/../agents/main/sessions`;
            const miner = new SkillMiner(config, sessionsDir);
            
            const skills = await miner.scan(parseInt(options.days));
            
            console.log(`\nDiscovered ${skills.length} potential skills:`);
            console.log("=" .repeat(60));
            
            for (const skill of skills) {
              console.log(`\n🎯 ${skill.name}`);
              console.log(`   ${skill.description}`);
              console.log(`   Occurrences: ${skill.occurrenceCount} | Confidence: ${(skill.confidence * 100).toFixed(1)}%`);
              console.log(`   Triggers: ${skill.triggerPatterns.slice(0, 2).join(", ")}`);
              if (skill.toolsUsed.length > 0) {
                console.log(`   Tools: ${skill.toolsUsed.join(", ")}`);
              }
            }
          });

        minerCmd
          .command("generate <id>")
          .description("Generate SKILL.md from potential skill")
          .action(async (id: string) => {
            const skill = discoveredSkills.get(id);
            if (!skill) {
              console.log(`Skill ${id} not found. Run 'scan' first.`);
              return;
            }

            const workspacePath = api.runtime.config.getWorkspacePath();
            const skillsDir = `${workspacePath}/../skills/${skill.name}`;
            const content = generateSkillMd(skill);
            
            try {
              const fs = await import("node:fs/promises");
              await fs.mkdir(skillsDir, { recursive: true });
              await fs.writeFile(`${skillsDir}/SKILL.md`, content, "utf-8");
              
              console.log(`✓ Generated skill: ${skillsDir}/SKILL.md`);
            } catch (error) {
              console.error("Failed to generate skill:", error);
            }
          });

        minerCmd
          .command("list")
          .description("List discovered skills")
          .action(async () => {
            const skills = Array.from(discoveredSkills.values());
            
            console.log(`\n${skills.length} discovered skills:`);
            console.log("=" .repeat(60));
            
            for (const skill of skills) {
              const statusIcon = skill.status === "approved" ? "✓" : 
                                skill.status === "rejected" ? "✗" : "?";
              console.log(`${statusIcon} [${skill.status}] ${skill.name} (${skill.occurrenceCount}x)`);
            }
          });
      },
      { commands: ["skill-miner"] }
    );

    logger.info("Skill Miner plugin registered");
  },
};

/**
 * Generate SKILL.md content from potential skill
 */
function generateSkillMd(skill: PotentialSkill): string {
  const emoji = "🤖";
  const today = new Date().toISOString().split("T")[0];
  
  return `---
name: ${skill.name}
description: ${skill.description}
metadata:
  openclaw:
    emoji: ${emoji}
    autoGenerated: true
    sourceSessions: ${JSON.stringify(skill.sourceSessions.slice(0, 5))}
    generationDate: "${today}"
    occurrenceCount: ${skill.occurrenceCount}
---

# ${skill.name.charAt(0).toUpperCase() + skill.name.slice(1).replace(/-/g, " ")}

${skill.description}

## When to use (trigger phrases)

Use this skill when the user asks any of:

${skill.triggerPatterns.map((t) => `- "${t}"`).join("\n")}

## Workflow

${skill.workflowSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## Tools Used

${skill.toolsUsed.map((tool) => `- \`${tool}\``).join("\n")}

${skill.entitiesInvolved.length > 0 ? `
## Related Entities

${skill.entitiesInvolved.map((e) => `- @${e}`).join("\n")}
` : ""}

## Examples

<!-- Add examples here based on source sessions -->

## Tips

<!-- Add tips here based on successful executions -->

---
*This skill was automatically generated by Skill Miner*
*Confidence: ${(skill.confidence * 100).toFixed(1)}% | Based on ${skill.occurrenceCount} occurrences*
`;
}

export default skillMinerPlugin;
