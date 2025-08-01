import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.2";

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // CORS preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('법제처 API 검색 요청 시작 - 전체 URL:', req.url);
    
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    
    // 요청 파라미터 추출
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const target = searchParams.get('target') || 'law'; // law, prec, lawview, precview
    const page = searchParams.get('page') || '1';
    const display = Math.min(parseInt(searchParams.get('display') || '20'), 100).toString();
    const search = searchParams.get('search') || '0'; // 0:전체, 1:제목, 2:본문
    
    // 고급 검색 파라미터
    const sort = searchParams.get('sort') || 'date'; // date, score
    const order = searchParams.get('order') || 'desc'; // asc, desc
    const ancYd = searchParams.get('ancYd') || ''; // 공포일자 시작
    const ancYdEnd = searchParams.get('ancYdEnd') || ''; // 공포일자 종료
    const department = searchParams.get('department') || ''; // 소관부처
    
    // 환경변수에서 인증키 가져오기 (없으면 기본값 사용)
    const lawOC = Deno.env.get('LAW_OC') || 'bahnntf';
    
    console.log('검색 파라미터:', { query, target, page, display, search });
    
    if (!query.trim()) {
      return new Response(
        JSON.stringify({ 
          error: '검색어를 입력해주세요',
          code: 'MISSING_QUERY'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // 법제처 API 사용
    const apiUrl = 'https://www.law.go.kr/DRF/lawSearch.do';
    const apiParams = new URLSearchParams({
      OC: lawOC,
      target: target,
      type: 'JSON',
      query: query.trim(),
      display: display,
      page: page,
      search: search
    });

    // 고급 검색 파라미터 조건부 추가
    if (sort) apiParams.append('sort', sort);
    if (order) apiParams.append('order', order);
    if (ancYd) apiParams.append('ancYd', ancYd);
    if (ancYdEnd) apiParams.append('ancYdEnd', ancYdEnd);
    if (department) apiParams.append('department', department);

    console.log('API 호출 URL:', `${apiUrl}?${apiParams.toString()}`);

    // 법제처 API 호출
    const response = await fetch(`${apiUrl}?${apiParams.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PropertyTaxHelper/1.0)',
        'Accept': 'application/json, application/xml, text/xml, */*',
        'Accept-Charset': 'utf-8',
      },
    });

    if (!response.ok) {
      console.error('법제처 API 오류:', response.status, response.statusText);
      throw new Error(`법제처 API 응답 오류: ${response.status}`);
    }

    const responseText = await response.text();
    console.log('API 응답 수신, 길이:', responseText.length);
    console.log('API 응답 내용 (처음 1000자):', responseText.substring(0, 1000));

    let jsonData: any;

    // 응답 데이터 파싱 (XML인지 JSON인지 확인)
    try {
      if (responseText.trim().startsWith('<')) {
        // XML 응답인 경우 JSON으로 변환
        console.log('XML 응답을 JSON으로 변환 중...');
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          textNodeName: '#text',
          parseAttributeValue: true,
          parseTagValue: true,
          trimValues: true
        });
        
        const xmlData = parser.parse(responseText);
        jsonData = xmlData;
      } else {
        // JSON 응답인 경우 파싱
        console.log('JSON 응답 파싱 중...');
        jsonData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('응답 파싱 오류:', parseError);
      console.log('원본 응답 (처음 500자):', responseText.substring(0, 500));
      
      return new Response(
        JSON.stringify({ 
          error: '법제처 API 응답 파싱 실패',
          code: 'PARSE_ERROR',
          details: parseError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // 성공 응답 반환
    console.log('검색 완료, 결과 반환');
    return new Response(
      JSON.stringify({
        success: true,
        data: jsonData,
        meta: {
          query: query,
          target: target,
          page: parseInt(page),
          display: parseInt(display),
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );

  } catch (error) {
    console.error('법제처 API 프록시 오류:', error);
    
    return new Response(
      JSON.stringify({ 
        error: '법제처 검색 중 오류가 발생했습니다',
        code: 'INTERNAL_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }
});