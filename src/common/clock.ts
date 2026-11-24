import { Injectable } from '@nestjs/common';

/** 지금 시각. 테스트에서 날짜를 바꿔볼 수 있게 주입받아 쓴다. */
@Injectable()
export class Clock {
  now() {
    return new Date();
  }

  /** 오늘 날짜(YYYY-MM-DD). 한국·일본은 같은 시간대라 KST 하나로 정한다 */
  today() {
    return this.now().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  }
}
