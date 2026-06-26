import React, { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { Property } from '../types';

import { getPublicPropertySlug } from '../utils/propertyShare';

import SeoHead from '../components/seo/SeoHead';

import Breadcrumbs from '../components/seo/Breadcrumbs';

import LeadCaptureForm from '../components/LeadCaptureForm';

import { getPageMetaByPath } from '../seo/pageMeta';

import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';

import { PRIMARY_CTA, getSiteOrigin } from '../seo/siteConfig';

import {

  getAllProjectNames,

  matchMarketZone,

  matchProjectName,

  PROPERTY_PROJECT_GROUPS,

} from '../seo/propertyCatalog';



interface CategoryListingsPageProps {

  categoryPath: string;

  filterType?: string;

  filterLocation?: string;

  filterMarketZone?: string;

}



const PRICE_FILTERS = [

  { value: 'all', label: 'Mọi mức giá' },

  { value: 'under3', label: 'Dưới 3 tỷ' },

  { value: '3to5', label: '3–5 tỷ' },

  { value: '5to10', label: '5–10 tỷ' },

  { value: 'over10', label: 'Trên 10 tỷ' },

];



function formatPrice(price: number) {

  return `${price} tỷ`;

}



function matchPrice(property: Property, range: string) {

  if (range === 'all') return true;

  if (range === 'under3') return property.price < 3;

  if (range === '3to5') return property.price >= 3 && property.price <= 5;

  if (range === '5to10') return property.price > 5 && property.price <= 10;

  if (range === 'over10') return property.price > 10;

  return true;

}



export default function CategoryListingsPage({

  categoryPath,

  filterType,

  filterLocation,

  filterMarketZone,

}: CategoryListingsPageProps) {

  const [properties, setProperties] = useState<Property[]>([]);

  const [selectedType, setSelectedType] = useState('all');

  const [selectedProject, setSelectedProject] = useState('all');

  const [selectedPrice, setSelectedPrice] = useState('all');

  const meta = getPageMetaByPath(categoryPath);

  const origin = getSiteOrigin();

  const breadcrumbs = [

    { name: 'Trang chủ', path: '/' },

    { name: meta?.title?.split('|')[0]?.trim() || categoryPath, path: categoryPath },

  ];



  useEffect(() => {

    fetch('/api/public/properties')

      .then(r => r.json())

      .then(json => {

        let list: Property[] = Array.isArray(json.data) ? json.data : [];

        list = list.filter(p => !['sold', 'hidden'].includes(p.sale_status || 'available'));

        if (filterType) {

          const ft = filterType.toLowerCase();

          list = list.filter(p => String(p.type).toLowerCase().includes(ft));

        }

        if (filterLocation) {

          const loc = filterLocation.toLowerCase();

          list = list.filter(p => String(p.location).toLowerCase().includes(loc));

        }

        if (filterMarketZone) {

          list = list.filter(p => matchMarketZone(p, filterMarketZone));

        }

        setProperties(list);

      })

      .catch(() => setProperties([]));

  }, [filterType, filterLocation, filterMarketZone]);



  const projectOptions = useMemo(() => {

    const fromData = Array.from(new Set(properties.map(p => p.project_name).filter(Boolean))) as string[];

    const zoneProjects = filterMarketZone

      ? PROPERTY_PROJECT_GROUPS.find(g => g.zone === filterMarketZone || (filterMarketZone === 'nam-da-nang' && g.zone === 'nam-da-nang'))?.projects || []

      : getAllProjectNames();

    return Array.from(new Set([...fromData, ...zoneProjects])).sort((a, b) => a.localeCompare(b, 'vi'));

  }, [properties, filterMarketZone]);



  const propertyTypes = useMemo(

    () => Array.from(new Set(properties.map(p => p.type))).sort(),

    [properties]

  );



  const filtered = useMemo(() => {

    return properties.filter(property => {

      const typeOk = selectedType === 'all' || property.type === selectedType;

      const projectOk = matchProjectName(property, selectedProject);

      const priceOk = matchPrice(property, selectedPrice);

      return typeOk && projectOk && priceOk;

    });

  }, [properties, selectedPrice, selectedProject, selectedType]);



  const isNamDaNang = categoryPath === '/nam-da-nang' || filterMarketZone === 'nam-da-nang';



  return (

    <>

      <SeoHead

        title={meta?.title || 'Bất động sản Đà Nẵng'}

        description={meta?.description || ''}

        path={categoryPath}

        schemas={[

          ...buildDefaultPageSchemas(breadcrumbs, origin),

          buildBreadcrumbSchema(breadcrumbs, origin),

        ]}

      />

      <div className="mx-auto max-w-7xl px-4 py-10">

        <Breadcrumbs items={breadcrumbs} className="mb-6" />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">

          <div className="min-w-0 flex-1">

            <h1 className="text-3xl font-extrabold text-slate-950">

              {meta?.title?.split('|')[0]?.trim() || 'Bất động sản'}

            </h1>

            <p className="mt-3 text-slate-600">{meta?.description}</p>



            <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">

              <select

                value={selectedType}

                onChange={e => setSelectedType(e.target.value)}

                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"

              >

                <option value="all">Tất cả loại hình</option>

                {propertyTypes.map(type => (

                  <option key={type} value={type}>{type}</option>

                ))}

              </select>

              <select

                value={selectedProject}

                onChange={e => setSelectedProject(e.target.value)}

                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"

              >

                <option value="all">{isNamDaNang ? 'Tất cả dự án / khu vực' : 'Tất cả dự án'}</option>

                {projectOptions.map(project => (

                  <option key={project} value={project}>{project}</option>

                ))}

              </select>

              <select

                value={selectedPrice}

                onChange={e => setSelectedPrice(e.target.value)}

                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"

              >

                {PRICE_FILTERS.map(item => (

                  <option key={item.value} value={item.value}>{item.label}</option>

                ))}

              </select>

              <button

                type="button"

                onClick={() => {

                  setSelectedType('all');

                  setSelectedProject('all');

                  setSelectedPrice('all');

                }}

                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-invest-blue/30"

              >

                Xóa bộ lọc

              </button>

            </div>



            <p className="mt-4 text-sm font-semibold text-slate-600">

              {filtered.length} sản phẩm phù hợp

            </p>



            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {filtered.map(property => (

                <Link

                  key={property.id}

                  to={`/${encodeURIComponent(getPublicPropertySlug(property))}`}

                  className="overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:shadow-lg"

                >

                  <img

                    src={property.gallery_images?.[0] || property.images}

                    alt={`${property.title} — ${property.location} — ${property.type}`}

                    loading="lazy"

                    decoding="async"

                    className="aspect-[4/3] w-full object-cover"

                  />

                  <div className="p-4">

                    {property.project_name && (

                      <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">{property.project_name}</p>

                    )}

                    <h2 className="line-clamp-2 font-bold text-slate-950">{property.title}</h2>

                    <p className="mt-1 text-sm text-slate-500">{property.location}</p>

                    <p className="mt-2 font-bold text-invest-gold">{formatPrice(property.price)}</p>

                  </div>

                </Link>

              ))}

            </div>



            {filtered.length === 0 && (

              <p className="mt-8 text-slate-500">Chưa có sản phẩm phù hợp. Liên hệ để nhận danh sách riêng.</p>

            )}

          </div>

          <aside className="w-full shrink-0 lg:w-80 lg:sticky lg:top-24">

            <LeadCaptureForm source={categoryPath} submitLabel={PRIMARY_CTA} compact />

          </aside>

        </div>

      </div>

    </>

  );

}

