import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient);

  getTranslation(lang: string) {
    // Die Sprachdateien liegen unter public/i18n/<lang>.json
    // und werden beim Build nach /i18n/<lang>.json kopiert.
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}
