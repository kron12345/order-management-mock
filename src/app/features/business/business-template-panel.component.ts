import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { BusinessTemplateService } from '../../core/services/business-template.service';
import {
  BusinessTemplate,
  BusinessTemplateAutomation,
  BusinessTemplateStep,
} from '../../core/models/business-template.model';

@Component({
  selector: 'app-business-template-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './business-template-panel.component.html',
  styleUrl: './business-template-panel.component.scss',
})
export class BusinessTemplatePanelComponent {
  private readonly templateService = inject(BusinessTemplateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly templates = this.templateService.templates;
  readonly automationRules = this.templateService.automationRules;

  readonly templateForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(1200)]],
    instructions: ['', Validators.maxLength(800)],
    assignmentName: ['', [Validators.required, Validators.maxLength(80)]],
    assignmentType: ['group', Validators.required],
    tag: ['', Validators.maxLength(40)],
    offsetDays: [-7, Validators.required],
    anchor: ['production_start', Validators.required],
    category: ['Custom'],
    parameterHints: ['', Validators.maxLength(200)],
    steps: this.fb.array([
      this.createStepGroup({
        title: 'Setup vorbereiten',
        description: 'Vorlage initialisieren und Pflichtfelder prüfen.',
        anchor: 'production_start',
        offsetDays: -7,
      }),
    ]),
  });

  readonly automationForm = this.fb.group({
    templateId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(160)]],
    trigger: ['', [Validators.required, Validators.maxLength(200)]],
    condition: ['', [Validators.required, Validators.maxLength(200)]],
    leadTimeDays: [7, [Validators.required, Validators.min(0)]],
    nextRun: [''],
    nextTemplateId: [''],
    webhookUrl: ['', Validators.maxLength(200)],
    webhookPayload: [''],
    testMode: [false],
  });

  readonly contextTagsControl = new FormControl('', { nonNullable: true });

  readonly selectedTemplateId = signal<string | null>(null);
  readonly selectedTemplate = computed(() =>
    this.selectedTemplateId() ? this.templateService.getTemplateById(this.selectedTemplateId()!) : null,
  );
  readonly selectedDependencies = computed(() => {
    const id = this.selectedTemplateId();
    if (!id) {
      return { upstream: [], downstream: [] };
    }
    return {
      upstream: this.templateService.getPredecessors(id),
      downstream: this.templateService.getDependents(id),
    };
  });
  readonly selectedExecutionLog = computed(() => {
    const id = this.selectedTemplateId();
    if (!id) {
      return [];
    }
    return this.templateService.getExecutionLog(id);
  });
  readonly recommendationTemplates = computed(() => {
    const raw = this.contextTagsControl.value.trim();
    const tags = raw
      ? raw.split(',').map((tag) => tag.trim()).filter((tag) => !!tag)
      : [];
    return this.templateService.recommendationsForContext({
      tags,
      customerPriority: tags.includes('#premium') ? 'premium' : 'standard',
    });
  });
  readonly stepPresets = [
    {
      label: 'Freigabe einholen',
      description: 'Kunde & Betrieb bestätigen lassen',
      anchor: 'production_start' as BusinessTemplate['dueRule']['anchor'],
      offsetDays: -7,
    },
    {
      label: 'TTR Frühwarnung',
      description: 'Operations informieren und Slot sichern',
      anchor: 'go_live' as BusinessTemplate['dueRule']['anchor'],
      offsetDays: -10,
    },
    {
      label: 'Jahresbedarf prüfen',
      description: 'Forecast aktualisieren',
      anchor: 'order_creation' as BusinessTemplate['dueRule']['anchor'],
      offsetDays: 7,
    },
  ];
  readonly timelinePreview = computed(() =>
    this.stepsControls().map((group) => ({
      title: group.value.title,
      label: this.describeOffset(
        group.value.anchor as BusinessTemplate['dueRule']['anchor'],
        Number(group.value.offsetDays),
      ),
    })),
  );
  readonly templateValidationMessages = computed(() => {
    const issues: string[] = [];
    if (!this.stepsControls().length) {
      issues.push('Mindestens einen Workflow-Schritt hinzufügen.');
    }
    if (!this.templates().length) {
      issues.push('Vorlagenliste ist leer – zuerst eine Vorlage speichern.');
    }
    return issues;
  });

  constructor() {
    effect(
      () => {
        const first = this.templates()[0];
        if (first && !this.selectedTemplateId()) {
          this.selectedTemplateId.set(first.id);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const templateId = this.selectedTemplateId();
        if (templateId && !this.automationForm.value.templateId) {
          this.automationForm.patchValue({ templateId }, { emitEvent: false });
        }
      },
      { allowSignalWrites: true },
    );
  }

  templateTagColor(tag: string): string {
    const normalized = tag.toLowerCase();
    if (normalized.includes('frist')) {
      return 'tag-chip--alert';
    }
    if (normalized.includes('ttt') || normalized.includes('ttr')) {
      return 'tag-chip--info';
    }
    return 'tag-chip--default';
  }

  templateAnchorLabel(template: BusinessTemplate): string {
    const { anchor, offsetDays, label } = template.dueRule;
    const base = label || this.describeOffset(anchor, offsetDays);
    return base;
  }

  stepDueLabel(step: BusinessTemplateStep): string {
    return step.dueRule.label || this.describeOffset(step.dueRule.anchor, step.dueRule.offsetDays);
  }

  describeOffset(anchor: BusinessTemplate['dueRule']['anchor'], offsetDays: number): string {
    const abs = Math.abs(offsetDays);
    const direction = offsetDays < 0 ? 'vor' : 'nach';
    return `${abs} Tage ${direction} ${this.anchorLabel(anchor)}`;
  }

  anchorLabel(anchor: BusinessTemplate['dueRule']['anchor']): string {
    switch (anchor) {
      case 'order_creation':
        return 'Auftragserstellung';
      case 'go_live':
        return 'Go-Live';
      default:
        return 'Produktion';
    }
  }

  stepsControls(): FormGroup[] {
    return (this.templateForm.controls.steps as FormArray).controls as FormGroup[];
  }

  addStep(preset?: {
    label?: string;
    description?: string;
    anchor?: BusinessTemplate['dueRule']['anchor'];
    offsetDays?: number;
  }) {
    const group = this.createStepGroup({
      title: preset?.label,
      description: preset?.description,
      anchor: preset?.anchor,
      offsetDays: preset?.offsetDays,
    });
    (this.templateForm.controls.steps as FormArray).push(group);
  }

  removeStep(index: number) {
    (this.templateForm.controls.steps as FormArray).removeAt(index);
  }

  private createStepGroup(preset?: {
    title?: string;
    description?: string;
    anchor?: BusinessTemplate['dueRule']['anchor'];
    offsetDays?: number;
  }) {
    return this.fb.group({
      id: [
        preset?.title?.toLowerCase().replace(/\s+/g, '-') ??
          `step-${Math.random().toString(36).slice(2, 7)}`,
      ],
      title: [preset?.title ?? '', Validators.required],
      description: [preset?.description ?? '', Validators.required],
      anchor: [preset?.anchor ?? 'production_start'],
      offsetDays: [preset?.offsetDays ?? -7],
      checklist: [''],
    });
  }

  quickSelect(templateId: string) {
    this.selectedTemplateId.set(templateId);
  }

  createTemplate() {
    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }
    const value = this.templateForm.value;
    const assignment = {
      type: value.assignmentType as 'group' | 'person',
      name: value.assignmentName!.trim(),
    };
    const tag = value.tag?.trim();
    const steps = this.stepsControls()
      .map((control) => ({
        id: control.value.id,
        title: control.value.title?.trim() ?? '',
        description: control.value.description?.trim() ?? '',
        dueRule: {
          anchor: control.value.anchor as BusinessTemplate['dueRule']['anchor'],
          offsetDays: Number(control.value.offsetDays),
          label: this.describeOffset(
            control.value.anchor as BusinessTemplate['dueRule']['anchor'],
            Number(control.value.offsetDays),
          ),
        },
        checklist: control.value.checklist
          ? control.value.checklist
              .split(',')
              .map((entry: string) => entry.trim())
              .filter((entry: string) => !!entry)
          : undefined,
      }))
      .filter((step) => step.title.length);
    const parameterHints = value.parameterHints
      ?.split(',')
      .map((hint) => hint.trim())
      .filter((hint) => !!hint);
    const template = this.templateService.createTemplate({
      title: value.title!.trim(),
      description: value.description!.trim(),
      instructions: value.instructions?.trim(),
      assignment,
      tags: tag ? [tag.startsWith('#') ? tag : `#${tag}`] : [],
      dueRule: {
        anchor: value.anchor as BusinessTemplate['dueRule']['anchor'],
        offsetDays: Number(value.offsetDays),
        label: this.describeOffset(value.anchor as BusinessTemplate['dueRule']['anchor'], Number(value.offsetDays)),
      },
      defaultLeadTimeDays: Math.abs(Number(value.offsetDays)),
      category: value.category as BusinessTemplate['category'],
      parameterHints,
      steps,
    });
    this.templateForm.reset({
      title: '',
      description: '',
      instructions: '',
      assignmentName: '',
      assignmentType: 'group',
      tag: '',
      offsetDays: -7,
      anchor: 'production_start',
      category: 'Custom',
      parameterHints: '',
    });
    (this.templateForm.controls.steps as FormArray).clear();
    this.snackBar.open(`Vorlage "${template.title}" gespeichert.`, 'OK', { duration: 2500 });
  }

  addAutomationRule() {
    if (this.automationForm.invalid) {
      this.automationForm.markAllAsTouched();
      return;
    }
    const value = this.automationForm.value;
    const nextRun = value.nextRun ? new Date(value.nextRun) : undefined;
    const webhook =
      value.webhookUrl?.trim().length
        ? {
            url: value.webhookUrl.trim(),
            method: 'POST' as const,
            payloadTemplate: value.webhookPayload ?? undefined,
          }
        : undefined;
    this.templateService.addAutomationRule({
      templateId: value.templateId!,
      title: value.title!.trim(),
      trigger: value.trigger!.trim(),
      condition: value.condition!.trim(),
      leadTimeDays: Number(value.leadTimeDays),
      nextRun,
      nextTemplateId: value.nextTemplateId?.trim() || undefined,
      webhook,
      testMode: value.testMode ?? false,
    });
    this.automationForm.reset({
      templateId: this.selectedTemplateId() ?? '',
      title: '',
      trigger: '',
      condition: '',
      leadTimeDays: 7,
      nextRun: '',
      nextTemplateId: '',
      webhookUrl: '',
      webhookPayload: '',
      testMode: false,
    });
    this.snackBar.open('Automatisierung gespeichert.', 'OK', { duration: 2500 });
  }

  toggleAutomation(ruleId: string, active: boolean) {
    this.templateService.toggleAutomationRule(ruleId, active);
  }

  simulateAutomation(rule: BusinessTemplateAutomation) {
    const result = this.templateService.simulateAutomation(rule.id);
    this.snackBar.open(result.message, 'OK', { duration: 3000 });
  }

  templateById(id: string | null): BusinessTemplate | undefined {
    if (!id) {
      return undefined;
    }
    return this.templates().find((template) => template.id === id);
  }

}
