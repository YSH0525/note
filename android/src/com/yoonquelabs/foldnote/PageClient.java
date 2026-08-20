package com.yoonquelabs.foldnote;

import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 페이지 로드가 끝난 시점을 알기 위한 것. 시스템 바 높이는 페이지보다 먼저 도착할 수
 * 있어서, 로드 완료 후 한 번 더 밀어 넣어야 한다.
 *
 * 익명 클래스는 d8 크래시 이력이 있어 별도 파일로 둔다 (ChromeClient 와 같은 이유).
 */
public class PageClient extends WebViewClient {
    private final MainActivity host;

    public PageClient(MainActivity host) {
        this.host = host;
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        host.onPageReady();
    }
}
