package com.yoonquelabs.foldnote;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity implements View.OnApplyWindowInsetsListener {
    /**
     * 안드로이드 15(API 35)부터는 targetSdk 35 이상인 앱의 창을 시스템이 강제로
     * 화면 끝까지 늘린다. 상태바가 웹뷰 내용 위에 겹쳐 그려져서 상단 헤더가 시계·
     * 배터리 아이콘에 가린다. 그 아래 버전은 예전처럼 시스템이 알아서 자리를
     * 비워주므로 건드리지 않는다.
     */
    private static final boolean EDGE_TO_EDGE = Build.VERSION.SDK_INT >= 35;

    static final int FILE_REQ = 1;
    WebView web;
    ValueCallback<Uri[]> pendingFileCallback;

    private int barTop, barBottom;   // CSS px 로 환산한 시스템 바 높이
    private boolean pageReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new PageClient(this));
        web.setWebChromeClient(new ChromeClient(this));
        if (EDGE_TO_EDGE) {
            web.addJavascriptInterface(new Bridge(this), "FoldNote");
            web.setOnApplyWindowInsetsListener(this);
        }
        setContentView(web);
        if (savedInstanceState == null) web.loadUrl("file:///android_asset/index.html");
        else web.restoreState(savedInstanceState);
    }

    /**
     * 시스템 바가 차지하는 높이를 재서 웹 쪽에 넘긴다.
     *
     * CSS 의 env(safe-area-inset-top) 으로는 안 된다 — 안드로이드 웹뷰에서 그 값은
     * 디스플레이 컷아웃만 반영하고 상태바 높이는 0 으로 준다. iOS 와 다른 부분이라
     * 착각하기 쉽다. 그래서 실측값을 CSS 변수로 직접 써넣는다.
     *
     * insets 를 소비하지 않고 그대로 돌려주므로 키보드(adjustResize) 동작은 그대로다.
     */
    @Override
    public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
        Insets bars = insets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        float d = getResources().getDisplayMetrics().density;
        barTop = Math.round(bars.top / d);
        barBottom = Math.round(bars.bottom / d);
        pushBarSizes();
        return insets;
    }

    /** 시스템 바 높이가 페이지 로드보다 먼저 올 수 있어 양쪽에서 부른다. */
    private void pushBarSizes() {
        if (!pageReady) return;
        web.evaluateJavascript(
                "document.documentElement.style.setProperty('--bar-top','" + barTop + "px');"
              + "document.documentElement.style.setProperty('--bar-bottom','" + barBottom + "px');",
                null);
    }

    void onPageReady() {
        pageReady = true;
        pushBarSizes();
    }

    /**
     * 상태바·내비바 아이콘 명암을 앱 테마에 맞춘다. 바 뒤로 앱 배경이 비치므로
     * 라이트 테마에 흰 아이콘이 얹히면 아무것도 안 보인다.
     */
    void applyBarAppearance(boolean dark) {
        if (!EDGE_TO_EDGE) return;
        WindowInsetsController c = getWindow().getInsetsController();
        if (c == null) return;
        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                  | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        // 밝은 배경 위에는 어두운 아이콘 — APPEARANCE_LIGHT_* 가 그 뜻이다
        c.setSystemBarsAppearance(dark ? 0 : light, light);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_REQ) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(result);
            pendingFileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
