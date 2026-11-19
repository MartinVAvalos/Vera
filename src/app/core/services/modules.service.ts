import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { Module } from '../models';

@Injectable({ providedIn: 'root' })
export class ModulesService {
  listModules(): Promise<Module[]> {
    return invoke<Module[]>('list_modules');
  }

  installModule(id: string, url: string): Promise<void> {
    return invoke<void>('install_module', { id, url });
  }

  uninstallModule(id: string): Promise<void> {
    return invoke<void>('uninstall_module', { id });
  }
}
