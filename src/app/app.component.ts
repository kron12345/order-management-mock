import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MATERIAL_IMPORTS } from './core/material.imports.imports';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ...MATERIAL_IMPORTS],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {}
