\# Nexus Architecture Brief



\## Version



Nexus v0.2.x



Purpose:

Technical brief for AI architecture review and future development.



Audience:

Senior AI Systems Architect / Agent Framework Engineer.



\---



\# 1. Project Vision



Nexus is not intended to be another ChatGPT wrapper.



The goal is to create a personal AI operating environment:



\- AI chat interface

\- autonomous coding agent

\- file analysis system

\- document/image/project processing

\- local and cloud model support

\- extensible AI provider system



The main idea:



A normal LLM is a powerful brain without hands.



Nexus adds:



\- memory

\- tools

\- execution

\- verification

\- evidence

\- project awareness



Architecture goal:





User

|

v

Nexus Interface

|

v

Agent Core

|

+---- Planning

|

+---- Memory

|

+---- Tools

|

+---- File System

|

+---- Execution

|

+---- Verification

|

+---- Evidence

|

v

Result







\---



\# 2. Current Product Idea



Nexus should eventually support:



\## FREE



Open-source client.



User provides:

\- own API key

\- own local model



No included AI budget.





\## PRO



Nexus hosted AI access.



Includes:

\- selected premium models

\- monthly usage limit





\## ULTRA



Maximum access.



Includes:

\- strongest available models

\- higher monthly limits





\## BYOK



Bring Your Own Key.



User connects:

\- OpenAI

\- Anthropic

\- Google

\- local models

\- custom endpoints





\## Local AI



Support:



\- llama.cpp

\- Ollama

\- LM Studio

\- vLLM

\- other OpenAI-compatible servers



\---



\# 3. Current Architecture



Current stack:



\## Frontend



React + Vite



Responsibilities:



\- chat UI

\- project selection

\- execution view

\- task history





\## Backend



TypeScript/Bun.



Responsibilities:



\- API server

\- sessions

\- agent execution

\- storage

\- providers





\## Core



Agent system.



Current concepts:



\- state machine

\- tool execution

\- permissions

\- evidence ledger

\- verification

\- recovery





\---



\# 4. Current Agent Flow



Current execution:





User Request



↓



Recovering



↓



Understanding



↓



Planning



↓



Acting



↓



Tool Execution



↓



Observing



↓



Verifying



↓



Completion Decision





Example:



User:



"Find bug and fix it"



Agent:



1\. list files

2\. read target file

3\. modify code

4\. run test

5\. collect evidence

6\. report result





\---



\# 5. Implemented Features



\## Agent Loop



Implemented.



Agent can:



\- reason about tasks

\- call tools

\- inspect projects

\- modify files





\## Tools



Implemented:



\- list

\- read

\- write

\- edit

\- bash

\- verify





\## Permission System



Implemented:



Before risky actions:





WAITING\_PERMISSION





Example:





bash execution requires approval





User can allow/deny.





\## Evidence System



Implemented:



Tracks:



\- tool results

\- hashes

\- actions

\- verification state





\## Provider System



Implemented abstraction:



Supports:



\- OpenAI compatible endpoints

\- local models





\## Local Model Testing



Successfully tested with:



ornith-ai/Ornith-1.5-9B-GGUF



\---



\# 6. Real Test Results



During testing Nexus successfully:



\- started local agent

\- inspected projects

\- read files

\- executed commands

\- modified files

\- ran verification





Example successful chain:





list → SUCCESS



read → SUCCESS



edit/write → SUCCESS



verify → SUCCESS





\---



\# 7. Problems Found During Testing



\## P0 — Context Management



Critical issue.



Example:





Message too long:

8703 tokens exceeds 8192-token context window





Cause:



The whole history is sent to the model:



\- messages

\- tool calls

\- outputs

\- evidence

\- system context





Need:



Context Manager.



Requirements:



\- token budget tracking

\- automatic compression

\- memory layers

\- continuation after compression





Desired:





Full History

|

v

Context Compressor

|

v

Active Context

|

v

Model





\---



\# P1 — Completion System



Current problem:



Agent can complete work but fail because evidence criteria are missing.



Need:



Automatic goal criteria generation.



Example:



User:



"Fix add function and verify"



Generate:





Criteria:



Function returns correct result



Test passes



Evidence collected





\---



\# P1 — Diff System



Current issue:



Changes detected:





calculator.py +4 -4





but diff visualization incomplete.





Need:



Show:



Before:



```python

return a-b



After:



return a+b



Store:



old hash

new hash

timestamp

rollback information

P1 — Recovery System



Current behavior:



Some failures lead to FAILED state.



Need:



Agent recovery.



Example:



Error:



context\_length\_exceeded



Should become:



Detect error



↓



Compress context



↓



Restore state



↓



Continue task

P2 — Memory Architecture



Need multi-level memory.



Suggested:



L0:

Current action



L1:

Task summary



L2:

Project knowledge



L3:

Full history



Model should receive only relevant information.



8\. Comparison Targets



Architecture should be compared against:



Cursor Agent



Important features:



codebase understanding

context management

edits

verification

Claude Code



Important features:



terminal usage

long tasks

project memory

OpenAI Codex CLI



Important features:



agent loop

sandbox

execution

verification

Devin



Important features:



planning

autonomous workflow

9\. Current Weakness



Current limitation is not model intelligence.



The main limitation:



Agent Core reliability



The system needs:



better memory

better context handling

better verification

better rollback

10\. Desired Nexus v1 Architecture



Target:



&#x20;                Nexus



&#x20;                 |

&#x20;           Agent Runtime



&#x20;                 |

&#x20;    +------------+-------------+



&#x20;    Planner                 Memory



&#x20;    Tools                   Context Manager



&#x20;    Executor                Evaluator



&#x20;    Verification            Evidence



&#x20;                 |



&#x20;            Providers



&#x20;    Cloud Models / Local Models



11\. Development Priorities



Priority order:



Phase 1



Agent reliability:



Context Manager

Recovery

Completion

Evidence

Phase 2



Developer experience:



better diff

rollback

project memory

Phase 3



Product:



polished UI

accounts

cloud deployment

subscriptions

Phase 4



Advanced AI:



multi-agent workflows

autonomous research

personal knowledge base

12\. Main Question For Architect Review



Analyze Nexus and answer:



What parts of the architecture are correct?

What fundamental mistakes exist?

What should be changed before public release?

How should Nexus architecture evolve?

How close is Nexus to systems like Cursor Agent and Claude Code?

What missing components are required for production quality?



After analysis:



Create a prioritized implementation roadmap.

