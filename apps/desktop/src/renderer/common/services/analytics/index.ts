interface EventData {
  [key: string]: string | number | undefined;
}

/** 已停用原开源专案遥测，避免连接第三方品牌后端 */
export function sendEvent(
  _event_name: string,
  _title: string,
  _event_data: EventData = {},
): void {
  // no-op
}

export function trackButtonClick(buttonName: string): void {
  sendEvent('button_click', '', { button_name: buttonName });
}

export function trackCheckboxChange(
  checkboxName: string,
  value: string[],
): void {
  sendEvent('checkbox_change', '', {
    value: `${checkboxName}_${value.join(',')}`,
  });
}

export function trackPageView(pageName: string): void {
  sendEvent('page_view', '', { page_name: pageName });
}
