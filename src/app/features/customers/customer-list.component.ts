import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreateCustomerPayload,
  CustomerService,
} from '../../core/services/customer.service';
import { Customer } from '../../core/models/customer.model';
import { OrderService } from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss',
})
export class CustomerListComponent {
  private readonly customerService = inject(CustomerService);
  private readonly orderService = inject(OrderService);
  private readonly fb = inject(FormBuilder);

  readonly customers = this.customerService.customers;
  readonly orders = this.orderService.orders;
  readonly hasCustomers = computed(() => this.customers().length > 0);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    customerNumber: ['', [Validators.required, Validators.maxLength(40)]],
    projectNumber: ['', Validators.maxLength(80)],
    address: ['', Validators.maxLength(200)],
    notes: ['', Validators.maxLength(500)],
    contacts: this.fb.array<FormGroup>([]),
  });

  get contacts(): FormArray<FormGroup> {
    return this.form.controls.contacts as FormArray<FormGroup>;
  }

  addContact() {
    this.contacts.push(
      this.fb.group({
        name: ['', Validators.maxLength(120)],
        role: ['', Validators.maxLength(80)],
        email: ['', Validators.email],
        phone: ['', Validators.maxLength(40)],
      }),
    );
  }

  removeContact(index: number) {
    this.contacts.removeAt(index);
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const contacts = this.contacts.controls
      .map((group) => group.getRawValue())
      .filter((contact) =>
        (contact.name ?? '').trim().length > 0 ||
        (contact.email ?? '').trim().length > 0 ||
        (contact.phone ?? '').trim().length > 0,
      )
      .map((contact, index) => ({
        id: `contact-form-${index}`,
        name: contact.name?.trim() ?? '',
        role: contact.role?.trim() || undefined,
        email: contact.email?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
      }));

    const payload: CreateCustomerPayload = {
      name: value.name!.trim(),
      customerNumber: value.customerNumber!.trim(),
      projectNumber: value.projectNumber?.trim() || undefined,
      address: value.address?.trim() || undefined,
      notes: value.notes?.trim() || undefined,
      contacts,
    };

    this.customerService.createCustomer(payload);
    this.resetForm();
  }

  deleteCustomer(customer: Customer) {
    const confirmDeletion = window.confirm(
      `Soll der Kunde "${customer.name}" wirklich gelöscht werden? Verknüpfte Aufträge verlieren die Zuordnung.`,
    );
    if (!confirmDeletion) {
      return;
    }
    this.customerService.deleteCustomer(customer.id);
    this.orderService.removeCustomerAssignments(customer.id);
  }

  linkedOrders(customerId: string): Order[] {
    return this.orders().filter((order) => order.customerId === customerId);
  }

  resetForm() {
    this.form.reset({
      name: '',
      customerNumber: '',
      projectNumber: '',
      address: '',
      notes: '',
    });
    this.contacts.clear();
  }
}
