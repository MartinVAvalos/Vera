import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the nav rail', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('app-nav-rail');
    expect(nav).toBeTruthy();
  });

  it('should render the reader area', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const reader = (fixture.nativeElement as HTMLElement).querySelector('app-reader-area');
    expect(reader).toBeTruthy();
  });
});
