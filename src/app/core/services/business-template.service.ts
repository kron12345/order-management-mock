import { Injectable, computed, signal } from '@angular/core';
import { BusinessService, CreateBusinessPayload } from './business.service';
import {
  BusinessTemplate,
  BusinessTemplateAutomation,
  BusinessTemplateContext,
  CreateBusinessTemplatePayload,
  CreateBusinessTemplateAutomationPayload,
  BusinessTemplateDependency,
  BusinessAutomationExecution,
  BusinessAutomationTestResult,
} from '../models/business-template.model';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const MOCK_BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: 'tpl-fristen',
    title: 'Bestellfrist überwachen',
    description:
      'Stellt sicher, dass alle Fahrplanbestellungen rechtzeitig vor dem Produktionsstart abgeschlossen sind.',
    instructions:
      'Kontrolliere offene Positionen, hole Freigaben bis zur Bestellfrist ein und dokumentiere Verzögerungen.',
    tags: ['#Frist', '#Bestellung'],
    category: 'Frist',
    recommendedAssignment: { type: 'group', name: 'Bestellteam' },
    dueRule: {
      anchor: 'production_start',
      offsetDays: -7,
      label: '7 Tage vor Produktion',
    },
    defaultLeadTimeDays: 7,
    automationHint: 'Automatisch bei Auftragspositionen mit Produktionstermin erzeugen.',
    steps: [
      {
        id: 'fristen-1',
        title: 'Positionen zusammenstellen',
        description: 'Alle relevanten Positionen mit TTR/TTT Tag aufnehmen.',
        dueRule: { anchor: 'production_start', offsetDays: -10, label: '10 Tage vor Produktion' },
        checklist: ['Position markiert', 'Termin geprüft'],
      },
      {
        id: 'fristen-2',
        title: 'Freigaben einholen',
        description: 'Abstimmung mit Operations & Kunde zur finalen Bestellung.',
        dueRule: { anchor: 'production_start', offsetDays: -7, label: '7 Tage vor Produktion' },
      },
    ],
    parameterHints: ['region', 'kundenklasse'],
  },
  {
    id: 'tpl-jahresbestellung',
    title: 'Jahresbestellung abstimmen',
    description:
      'Koordiniert die jährliche Mengenermittlung und Bestellung für wiederkehrende Leistungen.',
    instructions:
      'Abgleich mit Kunde & Bedarf, Bestellung auslösen, Rückmeldung dokumentieren.',
    tags: ['#Jahresbestellung', '#Planung'],
    category: 'Bestellung',
    recommendedAssignment: { type: 'person', name: 'L. Kramer' },
    dueRule: {
      anchor: 'order_creation',
      offsetDays: 30,
      label: '30 Tage nach Auftragserstellung',
    },
    defaultLeadTimeDays: 14,
    automationHint: 'Startet automatisch bei Positionen mit Tag #jahresbedarf.',
    steps: [
      {
        id: 'jahres-1',
        title: 'Bedarf sammeln',
        description: 'Forecast mit Kunde abstimmen.',
        dueRule: { anchor: 'order_creation', offsetDays: 7, label: '7 Tage nach Auftrag' },
      },
      {
        id: 'jahres-2',
        title: 'Bestellung auslösen',
        description: 'Jahresbestellung im System platzieren und bestätigen lassen.',
        dueRule: { anchor: 'order_creation', offsetDays: 30, label: '30 Tage nach Auftrag' },
      },
    ],
    parameterHints: ['kundensegment'],
  },
  {
    id: 'tpl-geleverkehr',
    title: 'Gelegenheitsverkehr koordinieren',
    description:
      'Sichert TTT/TTR Sonderfahrten durch rechtzeitige Abstimmung mit Kontingenten und Betrieb.',
    instructions:
      'Ticketkontingent prüfen, Kommunikation mit Betrieb planen, Abschluss dokumentieren.',
    tags: ['#Gelegenheitsverkehr', '#TTT', '#TTR'],
    category: 'Kommunikation',
    recommendedAssignment: { type: 'group', name: 'Operations Süd' },
    dueRule: {
      anchor: 'go_live',
      offsetDays: -5,
      label: '5 Tage vor Go-Live',
    },
    defaultLeadTimeDays: 10,
    steps: [
      {
        id: 'gele-1',
        title: 'Kontingent prüfen',
        description: 'Verfügbarkeit und Slot buchen.',
        dueRule: { anchor: 'go_live', offsetDays: -10, label: '10 Tage vor Go-Live' },
      },
      {
        id: 'gele-2',
        title: 'Kommunikation koordinieren',
        description: 'Betrieb und Kunden informieren.',
        dueRule: { anchor: 'go_live', offsetDays: -5, label: '5 Tage vor Go-Live' },
      },
    ],
  },
];

const MOCK_AUTOMATIONS: BusinessTemplateAutomation[] = [
  {
    id: 'auto-fristen',
    templateId: 'tpl-fristen',
    title: 'Bestellfrist aus Auftragsposition',
    trigger: 'Auftragsposition erstellt',
    condition: 'Kategorie = Fahrplan · Abfahrt gesetzt',
    leadTimeDays: 7,
    nextRun: new Date(Date.now() + DAY_IN_MS * 2).toISOString(),
    active: true,
    nextTemplateId: 'tpl-jahresbestellung',
    lastRunStatus: 'success',
    lastRunAt: new Date(Date.now() - DAY_IN_MS).toISOString(),
  },
  {
    id: 'auto-jahres',
    templateId: 'tpl-jahresbestellung',
    title: 'Jahresbedarf erkannt',
    trigger: 'Tag #jahresbedarf am Auftrag',
    condition: 'Zeitraum = neues Fahrplanjahr',
    leadTimeDays: 14,
    nextRun: new Date(Date.now() + DAY_IN_MS * 5).toISOString(),
    active: false,
    testMode: true,
  },
];

const MOCK_DEPENDENCIES: BusinessTemplateDependency[] = [
  {
    fromTemplateId: 'tpl-fristen',
    toTemplateId: 'tpl-jahresbestellung',
    description: 'Jahresbestellung startet automatisch sobald die Bestellfrist abgeschlossen ist.',
  },
];

const MOCK_EXECUTIONS: BusinessAutomationExecution[] = [
  {
    id: 'exec-001',
    ruleId: 'auto-fristen',
    templateId: 'tpl-fristen',
    status: 'success',
    timestamp: new Date(Date.now() - DAY_IN_MS).toISOString(),
    message: 'Geschäft FR-2024-001 erstellt (auto).',
  },
  {
    id: 'exec-002',
    ruleId: 'auto-jahres',
    templateId: 'tpl-jahresbestellung',
    status: 'warning',
    timestamp: new Date(Date.now() - DAY_IN_MS * 3).toISOString(),
    message: 'Trigger ohne passenden Auftrag · Regel blieb im Testmodus.',
  },
];

@Injectable({ providedIn: 'root' })
export class BusinessTemplateService {
  private readonly _templates = signal<BusinessTemplate[]>(MOCK_BUSINESS_TEMPLATES);
  private readonly _automations = signal<BusinessTemplateAutomation[]>(MOCK_AUTOMATIONS);
  private readonly _dependencies = signal<BusinessTemplateDependency[]>(MOCK_DEPENDENCIES);
  private readonly _executions = signal<BusinessAutomationExecution[]>(MOCK_EXECUTIONS);

  readonly templates = computed(() => this._templates());
  readonly automationRules = computed(() => this._automations());
  readonly dependencies = computed(() => this._dependencies());
  readonly automationExecutions = computed(() => this._executions());

  constructor(private readonly businessService: BusinessService) {}

  getTemplateById(id: string): BusinessTemplate | undefined {
    return this._templates().find((tpl) => tpl.id === id);
  }

  getDependents(templateId: string): BusinessTemplateDependency[] {
    return this._dependencies().filter((dep) => dep.fromTemplateId === templateId);
  }

  getPredecessors(templateId: string): BusinessTemplateDependency[] {
    return this._dependencies().filter((dep) => dep.toTemplateId === templateId);
  }

  getExecutionLog(templateId: string): BusinessAutomationExecution[] {
    return this._executions().filter((entry) => entry.templateId === templateId);
  }

  simulateAutomation(ruleId: string): BusinessAutomationTestResult {
    const rule = this._automations().find((entry) => entry.id === ruleId);
    if (!rule) {
      return { ruleId, success: false, message: 'Regel nicht gefunden.' };
    }
    const simulatedBusinessId = `sim-${rule.templateId}-${Date.now().toString(36)}`;
    return {
      ruleId,
      success: true,
      message: rule.testMode
        ? 'Testmodus erzeugt ein simuliertes Geschäft.'
        : 'Regelprüfung erfolgreich.',
      simulatedBusinessId,
    };
  }

  recordExecution(execution: BusinessAutomationExecution) {
    this._executions.update((entries) => [execution, ...entries].slice(0, 30));
    this._automations.update((rules) =>
      rules.map((rule) =>
        rule.id === execution.ruleId
          ? { ...rule, lastRunStatus: execution.status, lastRunAt: execution.timestamp }
          : rule,
      ),
    );
  }

  triggerAutomationsForTemplate(
    templateId: string,
    businessId: string,
    options?: {
      automationIds?: string[];
      linkedOrderItemIds?: string[];
    },
  ): void {
    const allowedIds = options?.automationIds?.length ? new Set(options.automationIds) : null;
    const rules = this._automations().filter(
      (rule) =>
        rule.templateId === templateId &&
        rule.active &&
        (!allowedIds || allowedIds.has(rule.id)),
    );
    if (!rules.length) {
      return;
    }
    const timestamp = new Date().toISOString();
    rules.forEach((rule) => {
      this.recordExecution({
        id: this.generateExecutionId(),
        ruleId: rule.id,
        templateId,
        status: 'success',
        timestamp,
        message: this.composeAutomationMessage(rule, businessId, options?.linkedOrderItemIds),
      });
    });
  }

  recommendationsForContext(context: BusinessTemplateContext): BusinessTemplate[] {
    const tags = context.tags ?? [];
    return this._templates()
      .filter((template) => {
        if (tags.length && !tags.some((tag) => template.tags.includes(tag))) {
          return false;
        }
        return true;
      })
      .slice(0, 5);
  }

  instantiateTemplate(templateId: string, context: BusinessTemplateContext = {}) {
    const template = this._templates().find((entry) => entry.id === templateId);
    if (!template) {
      throw new Error('Vorlage nicht gefunden.');
    }
    const anchor = context.targetDate ?? new Date();
    const dueDate = this.applyOffset(anchor, template.dueRule.offsetDays);
    const description = this.composeDescription(template.description, context.note);

    const payload: CreateBusinessPayload = {
      title: context.customTitle?.trim().length ? context.customTitle.trim() : template.title,
      description,
      dueDate,
      assignment: template.recommendedAssignment,
      tags: template.tags,
      linkedOrderItemIds: context.linkedOrderItemIds,
    };

    return this.businessService.createBusiness(payload);
  }

  createTemplate(payload: CreateBusinessTemplatePayload) {
    const template: BusinessTemplate = {
      id: this.generateTemplateId(),
      title: payload.title,
      description: payload.description,
      instructions: payload.instructions,
      tags: payload.tags ?? [],
      category: payload.category ?? 'Custom',
      recommendedAssignment: payload.assignment,
      dueRule: {
        ...payload.dueRule,
        label:
          payload.dueRule.label ||
          this.formatOffsetLabel(payload.dueRule.anchor, payload.dueRule.offsetDays),
      },
      defaultLeadTimeDays: payload.defaultLeadTimeDays,
      automationHint: payload.automationHint,
      steps: payload.steps,
      parameterHints: payload.parameterHints,
    };
    this._templates.update((entries) => [template, ...entries]);
    return template;
  }

  addAutomationRule(payload: CreateBusinessTemplateAutomationPayload) {
    const rule: BusinessTemplateAutomation = {
      id: this.generateAutomationId(),
      templateId: payload.templateId,
      title: payload.title,
      trigger: payload.trigger,
      condition: payload.condition,
      leadTimeDays: payload.leadTimeDays,
      nextRun: payload.nextRun?.toISOString(),
      active: true,
      nextTemplateId: payload.nextTemplateId,
      webhook: payload.webhook,
      testMode: payload.testMode,
    };
    this._automations.update((entries) => [rule, ...entries]);
    return rule;
  }

  toggleAutomationRule(ruleId: string, active: boolean) {
    this._automations.update((entries) =>
      entries.map((rule) => (rule.id === ruleId ? { ...rule, active } : rule)),
    );
  }

  addDependency(dependency: BusinessTemplateDependency) {
    this._dependencies.update((deps) => [...deps, dependency]);
  }

  private applyOffset(anchor: Date, offset: number): Date {
    const result = new Date(anchor);
    result.setDate(result.getDate() + offset);
    return result;
  }

  private composeDescription(base: string, note?: string) {
    if (!note?.trim()) {
      return base;
    }
    return `${base}\n\nHinweis: ${note.trim()}`;
  }

  private composeAutomationMessage(
    rule: BusinessTemplateAutomation,
    businessId: string,
    linkedItems: string[] | undefined,
  ): string {
    const parts = [`Regel "${rule.title}" für Geschäft ${businessId} ausgelöst`];
    if (linkedItems?.length) {
      parts.push(`Positionen: ${linkedItems.join(', ')}`);
    }
    if (rule.webhook?.url) {
      parts.push(`Webhook → ${rule.webhook.url}`);
    }
    return parts.join(' · ');
  }

  private formatOffsetLabel(
    anchor: BusinessTemplate['dueRule']['anchor'],
    offsetDays: number,
  ): string {
    const abs = Math.abs(offsetDays);
    const direction = offsetDays < 0 ? 'vor' : 'nach';
    const anchorLabel =
      anchor === 'order_creation'
        ? 'Auftragserstellung'
        : anchor === 'go_live'
          ? 'Go-Live'
          : 'Produktion';
    return `${abs} Tage ${direction} ${anchorLabel}`;
  }

  private generateTemplateId(): string {
    return `tpl-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateAutomationId(): string {
    return `auto-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateExecutionId(): string {
    return `exec-${Math.random().toString(36).slice(2, 10)}`;
  }
}
