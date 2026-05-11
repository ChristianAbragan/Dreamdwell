// backend/agent.js
import { cli, defineAgent, voice } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config();

const CHAT_TOPIC = 'lk.chat';

const extractTextContent = (item) => {
  if (!item?.content || !Array.isArray(item.content)) return '';

  return item.content
    .filter((part) => typeof part === 'string')
    .join(' ')
    .trim();
};

const formatScanContextForAssistant = (rawPayload) => {
  try {
    const context = JSON.parse(rawPayload);
    const selectedBox = context.selectedBox
      ? `Current selected box: ${context.selectedBox.item} on ${context.selectedBox.surface || 'unknown surface'} (${context.selectedBox.confidence || 'unknown'} confidence). Reason: ${context.selectedBox.reason || 'No reason provided.'}`
      : 'No suggestion box is currently selected.';
    const suggestions = Array.isArray(context.suggestions)
      ? context.suggestions
          .map(
            (item, index) =>
              `${index + 1}. ${item.item} - ${item.reason || 'No reason provided'} (${item.confidence || 'unknown'} confidence)`
          )
          .join('\n')
      : 'No suggestions are available.';

    return `Room scan context:
Status: ${context.scanStatus || 'unknown'}
Observation: ${context.explanation || 'No observation provided.'}
Diagnosis: ${context.audit || 'No diagnosis provided.'}
${selectedBox}
Suggestions:
${suggestions}`;
  } catch (_error) {
    return rawPayload;
  }
};

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    console.log('SYS.CORE ONLINE: Waiting for Chief Architect...');

    const participant = await ctx.waitForParticipant();
    const dna = JSON.parse(participant.metadata || '{}');
    const chefName = dna.userName || 'Broskie';
    const style = dna.style || 'Minimalist';
    const goal = dna.goal || 'Cost Efficiency';

    console.log(`Chief ${chefName} detected. Calibration: ${style} / ${goal}`);

    const groqLlm = openai.LLM.withGroq({
      model: 'llama-3.3-70b-versatile',
    });

    const agent = new voice.Agent({
      instructions: `
        You are J.A.R.V.I.S., a conversational architectural assistant helping ${chefName}.

        Your job is to feel natural, warm, and human in chat.
        Speak like a thoughtful design partner, not like a machine, narrator, or sci-fi system.

        Style guidance:
        - Use plain, natural English.
        - Sound friendly, calm, and collaborative.
        - Keep replies concise, but not stiff.
        - Use contractions when they sound natural.
        - Avoid ceremonial phrases, roleplay language, and dramatic AI introductions.
        - Avoid phrases like "systems online", "calibration", "protocols", "Chief Architect", or "Brutalist design project" unless the user explicitly asks for that tone.
        - Do not overpraise or flatter the user.
        - If the user asks about the system or how Dreamdwell works, explain it clearly in plain language.
        - If the user says something simple like "hello", answer like a real person would.

        Design guidance:
        - Adapt recommendations to this preference: ${style}.
        - Keep this goal in mind when giving advice: ${goal}.
        - When discussing design, be practical and specific.
      `,
      llm: groqLlm,
    });

    const session = new voice.AgentSession({
      llm: groqLlm,
    });

    const publishedReplyIds = new Set();

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, async (event) => {
      try {
        const item = event?.item;
        if (!item || item.role !== 'assistant') return;
        if (item.extra?.is_function_call || item.extra?.is_function_call_output) return;
        if (item.id && publishedReplyIds.has(item.id)) return;

        const text = extractTextContent(item);
        if (!text) return;

        if (item.id) publishedReplyIds.add(item.id);

        console.log('Mirroring assistant reply into room chat:', text);
        await ctx.room.localParticipant.sendText(text, { topic: CHAT_TOPIC });
      } catch (error) {
        console.error('Failed to mirror assistant reply into chat:', error);
      }
    });

    ctx.room.on('dataReceived', async (payload, _participant, _kind, topic) => {
      try {
        const str = new TextDecoder().decode(payload);

        if (topic === 'optical_scan') {
          session.interrupt();
          const scanContext = formatScanContextForAssistant(str);
          session.generateReply({
            userInput: `I just ran or updated an optical scan of the room. Store this as the current DreamDwell HUD context so you can answer follow-up questions about the boxes, suggestions, and system state. ${scanContext}. Briefly acknowledge what changed, especially the selected box if there is one.`,
          });
        }
      } catch (error) {
        console.error('Error parsing data channel:', error);
      }
    });

    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        textEnabled: true,
        audioEnabled: false,
      },
      outputOptions: {
        audioEnabled: false,
        transcriptionEnabled: false,
      },
    });

    session.generateReply({
      userInput: 'Give me a short, natural greeting like a real conversation starting.',
    });
  },
});

cli.runApp({
  agent: fileURLToPath(import.meta.url),
  agentName: 'dreamdwell-jarvis',
});
