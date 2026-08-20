package com.yoonquelabs.foldnote;

import android.webkit.JavascriptInterface;

/**
 * 웹 → 네이티브로 넘어오는 유일한 통로. 상태바 아이콘 명암을 바꾸는 것 하나뿐이다.
 * 로드하는 문서가 앱에 내장된 file:///android_asset/index.html 뿐이라 외부 스크립트가
 * 이 인터페이스에 닿을 수 없다.
 */
public class Bridge {
    private final MainActivity host;

    public Bridge(MainActivity host) {
        this.host = host;
    }

    /** 자바스크립트 인터페이스는 UI 스레드가 아닌 곳에서 불린다. */
    @JavascriptInterface
    public void setDark(boolean dark) {
        host.runOnUiThread(new BarTask(host, dark));
    }
}
