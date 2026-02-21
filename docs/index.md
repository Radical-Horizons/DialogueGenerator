# Project Documentation Index

## Project Overview

- **Type:** Multi-part application with 2 parts
- **Primary Language:** TypeScript (Frontend), Python (Backend)
- **Architecture:** Component-based SPA (Frontend) + REST API (Backend)
- **Repository Structure:** Multi-part (frontend + api)

## Quick Reference

- **Tech Stack:** React 18 + FastAPI
- **Entry Points:** 
  - Frontend: `frontend/src/main.tsx`
  - Backend: `api/main.py`
- **Architecture Pattern:** Component-based (Frontend), Layered (Backend)

## ⚠️ Documentation la plus récente

**La documentation la plus récente et à jour se trouve dans les dossiers artifacts de BMad :**

- **Planning Artifacts** : [`_bmad-output/planning-artifacts/`](../_bmad-output/planning-artifacts/)
  - Architecture détaillée, PRD, épics, rapports de préparation à l'implémentation
  - Contient la documentation de planification la plus récente
  
- **Implementation Artifacts** : [`_bmad-output/implementation-artifacts/`](../_bmad-output/implementation-artifacts/)
  - ADRs (Architecture Decision Records), plans de sprint, statut d'implémentation
  - Contient la documentation d'implémentation la plus récente

**Note** : La documentation dans `docs/` est organisée et structurée, mais peut être moins à jour que celle dans `_bmad-output/`. Consultez d'abord les artifacts BMad pour la documentation la plus récente.

## Documentation Structure

### Core Documentation

- [Project Overview](./project-overview.md) - Executive summary and project information
- [Technology Stack](./technology-stack.md) - Complete technology breakdown
- [Source Tree Analysis](./source-tree-analysis.md) - Directory structure with annotations
- [Complete Documentation](./DOCUMENTATION_COMPLETE.md) - Comprehensive documentation reference

### Architecture Documentation

Located in [`architecture/`](./architecture/)

- [Frontend Architecture](./architecture/architecture-frontend.md) - React application architecture
- [Backend Architecture](./architecture/architecture-api.md) - FastAPI API architecture
- [Integration Architecture](./architecture/integration-architecture.md) - Frontend-Backend integration
- [State Management](./architecture/state-management-frontend.md) - Zustand stores and patterns
- [UI Component Inventory](./architecture/ui-component-inventory-frontend.md) - React component catalog
- [Prompt Composition Architecture](./architecture/ARCHITECTURE_PROMPT_COMPOSITION.md) - Prompt composition architecture
- [Prompt Estimation Architecture](./architecture/ARCHITECTURE_PROMPT_ESTIMATION.md) - Prompt estimation architecture
- [Graph Editor](./architecture/GRAPH_EDITOR.md) - Graph editor documentation
- [Graph Editor Implementation](./architecture/GRAPH_EDITOR_IMPLEMENTATION.md) - Graph editor implementation
- [Field Validation](./architecture/FIELD_VALIDATION.md) - Field validation documentation
- [Missing API Features](./architecture/FONCTIONNALITES_MANQUANTES_API.md) - Missing API features
- [Migration & Refactoring 2026](./architecture/MIGRATION_REFACTORING_2026.md) - Migration and refactoring documentation
- [OpenAI API GPT-5](./architecture/OPENAI_API_GPT5.md) - OpenAI API documentation

### API Documentation

Located in [`api/`](./api/)

- [Backend API Contracts](./api/api-contracts-api.md) - Complete REST API endpoint documentation
- [Frontend API Client](./api/api-contracts-frontend.md) - Frontend API client modules
- [Backend Data Models](./api/data-models-api.md) - Pydantic schemas and models
- [Frontend Data Models](./api/data-models-frontend.md) - TypeScript types and interfaces

### Guides

Located in [`guides/`](./guides/)

- [Development Guide](./guides/development-guide.md) - Setup, commands, and workflow
- [Development Troubleshooting](./guides/DEVELOPMENT.md) - Development troubleshooting
- [Deployment Guide](./guides/deployment-guide.md) - Production deployment instructions
- [Deployment Documentation](./guides/DEPLOYMENT.md) - Deployment documentation
- [Security](./guides/SECURITY.md) - Security documentation
- [Testing](./guides/TESTING.md) - Testing guide

### Troubleshooting

Located in [`troubleshooting/`](./troubleshooting/)

- [Port 4242 Troubleshooting](./troubleshooting/TROUBLESHOOTING_PORT_4242.md) - Port troubleshooting
- [Scrollbar Fix](./troubleshooting/SCROLLBAR_FIX.md) - Scrollbar issue resolution
- [Diagnostic Extraction Fiches](./troubleshooting/DIAGNOSTIC_EXTRACTION_FICHES.md) - Diagnostic extraction
- [Prompt Parsing Issue](./troubleshooting/PROMPT_PARSING_ISSUE.md) - Prompt parsing troubleshooting
- [E2E avec LLM](./troubleshooting/e2e-llm.md) - Prérequis, preflight, dépannage des tests E2E qui appellent le LLM
- [Post-mortem E2E LLM](./troubleshooting/post-mortem-e2e-llm.md) - Causes, correctifs et leçons des tests graph-node-accept-reject

### Prompts Documentation

Located in [`prompts/`](./prompts/)

- [Prompt Structure](./prompts/PROMPT_STRUCTURE.md) - Prompt structure documentation
- [Prompt XML Format](./prompts/PROMPT_XML_FORMAT.md) - XML prompt format
- [Structured Output Explanation](./prompts/STRUCTURED_OUTPUT_EXPLANATION.md) - Structured output explanation

### Specifications

Located in [`specifications/`](./specifications/)

- [Technical Specification](./specifications/Spécification%20technique.md) - Technical specification
- [Modular Dialogue Generation Spec](./specifications/Specification_Generation_Modulaire_Dialogues.md) - Modular dialogue generation spec

### Analysis Documentation

Located in [`analysis/`](./analysis/)

- [Prompt Level Analysis](./analysis/ANALYSE_PROMPTS_NIVEAUX.md) - Prompt level analysis
- [XML Prompt Evaluation](./analysis/EVALUATION_PROMPT_XML.md) - XML prompt evaluation
- [Refactoring Analysis 2026](./analysis/REFACTORING_ANALYSIS_2026.md) - Refactoring analysis

### Mechanics Documentation

Located in [`mechanics/`](./mechanics/)

- [Relations Approach Analysis](./mechanics/ANALYSE_APPROCHE_RELATIONS.md) - Relations approach analysis
- [Stable Mechanics Integration](./mechanics/INTEGRATION_MECANIQUES_STABLE.md) - Stable mechanics integration

### Features Documentation

Located in [`features/`](./features/)

- [Current UI Structure](./features/current-ui-structure.md) - Current UI structure documentation (3-column layout, existing components)
- [V1.0 UX Specs](./features/v1.0-ux-specs.md) - UX specifications for V1.0 features (Progress Feedback, Presets)
- [V1.5 Unified Context Search](./features/v1.5-unified-context-search.md) - Unified context search specifications for V1.5
- [Screenshots](./features/screenshots/) - UI screenshots

### Deployment Configuration

Located in [`deployment/`](./deployment/)

- [Gunicorn Configuration](./deployment/gunicorn.conf.example) - Gunicorn configuration example
- [Nginx Configuration](./deployment/nginx.conf.example) - Nginx configuration example
- [Web Config](./deployment/web.config.example) - Web configuration example

### Resources

Located in [`resources/`](./resources/)

- Sample XML and text resources for testing and reference

### Diagrams

Located in [`diagrams/`](./diagrams/)

- [Workflow Method Diagram](./diagrams/workflow-method-greenfield.svg) - Workflow diagram

### Project Metadata

Located in [`metadata/`](./metadata/)

- [Project Parts](./metadata/project-parts.json) - Multi-part project structure metadata
- [Project Scan Report](./metadata/project-scan-report.json) - Project scan report

## Getting Started

### For New Developers

1. **Read**: [Project Overview](./project-overview.md)
2. **Setup**: Follow [Development Guide](./guides/development-guide.md)
3. **Understand Architecture**: Read [Frontend Architecture](./architecture/architecture-frontend.md) and [Backend Architecture](./architecture/architecture-api.md)
4. **Explore API**: Review [Backend API Contracts](./api/api-contracts-api.md)

### For Creating PRD

When creating a brownfield PRD:
- Reference this index as primary input
- Use architecture documents for technical context
- Review API contracts for feature understanding
- Check existing documentation for domain knowledge

### For Feature Development

1. **Understand Integration**: Read [Integration Architecture](./architecture/integration-architecture.md)
2. **Review Components**: Check [UI Component Inventory](./architecture/ui-component-inventory-frontend.md)
3. **Check State Management**: Review [Frontend State Management](./architecture/state-management-frontend.md)
4. **API Development**: Follow patterns in [Backend API Contracts](./api/api-contracts-api.md)

## Documentation Status

**Last Updated**: 2026-01-16
**Structure**: Reorganized into logical categories
**Parts Documented**: 2 (frontend, api)

## Next Steps

- **For Planning**: Use this documentation when creating PRD
- **For Development**: Reference architecture and API documentation
- **For Deployment**: Follow deployment guide
- **For Troubleshooting**: Check troubleshooting documentation

---

**Note**: This is the primary entry point for AI-assisted development. All generated documentation is located in the `docs/` directory with a logical folder structure.
